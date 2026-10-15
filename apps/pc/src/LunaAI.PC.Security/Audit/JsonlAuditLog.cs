using System.Text;
using System.Text.Json;
using LunaAI.PC.Diagnostics;
using LunaAI.PC.Security.Permissions;

namespace LunaAI.PC.Security.Audit;

/// <summary>
/// Append-only JSON Lines audit log written to the user's local application data
/// directory. Every detail value is passed through the secret redactor.
/// </summary>
public sealed class JsonlAuditLog : IAuditLog
{
    private readonly object _gate = new();
    private readonly JsonSerializerOptions _options = new() { WriteIndented = false };

    public JsonlAuditLog(string filePath, IAppLogger? logger = null)
    {
        if (string.IsNullOrWhiteSpace(filePath))
        {
            throw new ArgumentException("An audit log path is required.", nameof(filePath));
        }

        FilePath = filePath;
        var directory = Path.GetDirectoryName(Path.GetFullPath(filePath));
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        Logger = logger;
    }

    public string FilePath { get; }

    private IAppLogger? Logger { get; }

    public void Record(AuditEvent auditEvent)
    {
        ArgumentNullException.ThrowIfNull(auditEvent);

        var record = new Dictionary<string, object?>
        {
            ["timestamp"] = auditEvent.Timestamp.ToString("o"),
            ["kind"] = auditEvent.Kind,
            ["tool"] = auditEvent.ToolName,
            ["decision"] = auditEvent.Decision?.ToString(),
            ["reason"] = SecretRedactor.Redact(auditEvent.Reason),
            ["risk"] = auditEvent.Risk?.ToString(),
            ["level"] = auditEvent.Level.ToString(),
            ["details"] = auditEvent.Details.ToDictionary(
                pair => pair.Key,
                pair => SecretRedactor.Redact(pair.Value)),
        };

        var line = JsonSerializer.Serialize(record, _options);

        lock (_gate)
        {
            File.AppendAllText(FilePath, line + Environment.NewLine, Encoding.UTF8);
        }

        Logger?.Info("audit.recorded", new Dictionary<string, string>
        {
            ["kind"] = auditEvent.Kind,
            ["tool"] = auditEvent.ToolName,
        });
    }

    public IReadOnlyList<AuditEvent> Read(int maxEntries = 500)
    {
        lock (_gate)
        {
            if (!File.Exists(FilePath))
            {
                return Array.Empty<AuditEvent>();
            }

            var lines = File.ReadLines(FilePath).TakeLast(Math.Max(1, maxEntries));
            var events = new List<AuditEvent>();
            foreach (var line in lines)
            {
                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }

                try
                {
                    using var document = JsonDocument.Parse(line);
                    var root = document.RootElement;
                    events.Add(new AuditEvent(
                        DateTimeOffset.TryParse(GetString(root, "timestamp"), out var timestamp) ? timestamp : DateTimeOffset.MinValue,
                        GetString(root, "kind"),
                        GetString(root, "tool"),
                        Enum.TryParse<PermissionOutcome>(GetString(root, "decision"), out var decision) ? decision : null,
                        GetString(root, "reason"),
                        Enum.TryParse<RiskLevel>(GetString(root, "risk"), out var risk) ? risk : null,
                        Enum.TryParse<PermissionLevel>(GetString(root, "level"), out var level) ? level : PermissionLevel.Assist,
                        ReadDetails(root)));
                }
                catch (JsonException)
                {
                    // A partially written line must never break log reading.
                }
            }

            return events;
        }
    }

    private static string GetString(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? string.Empty
            : string.Empty;

    private static IReadOnlyDictionary<string, string> ReadDetails(JsonElement element)
    {
        var details = new Dictionary<string, string>(StringComparer.Ordinal);
        if (element.TryGetProperty("details", out var detailsElement) && detailsElement.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in detailsElement.EnumerateObject())
            {
                details[property.Name] = property.Value.ValueKind == JsonValueKind.String
                    ? property.Value.GetString() ?? string.Empty
                    : property.Value.ToString();
            }
        }

        return details;
    }
}
