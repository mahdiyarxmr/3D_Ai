using System.Text;
using System.Text.Json;
using LunaAI.PC.Core.Diagnostics;

namespace LunaAI.PC.Storage;

/// <summary>
/// Structured JSON-lines logger. Every message and field passes through
/// <see cref="SecretRedactor"/> so secrets cannot reach the log file.
/// </summary>
public sealed class FileLogger : IAppLogger, IDisposable
{
    private readonly object _gate = new();
    private readonly string _path;
    private readonly LogLevel _minimum;

    public FileLogger(string? path = null, LogLevel minimum = LogLevel.Information)
    {
        _path = path ?? AppPaths.LogFile;
        _minimum = minimum;
        var directory = Path.GetDirectoryName(Path.GetFullPath(_path));
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }
    }

    public string FilePath => _path;

    public void Log(LogLevel level, string eventName, IReadOnlyDictionary<string, string>? fields = null)
    {
        if (level < _minimum)
        {
            return;
        }

        var record = new Dictionary<string, object?>
        {
            ["timestamp"] = DateTimeOffset.Now.ToString("o"),
            ["level"] = level.ToString(),
            ["event"] = SecretRedactor.Redact(eventName),
            ["fields"] = (fields ?? new Dictionary<string, string>())
                .ToDictionary(pair => pair.Key, pair => SecretRedactor.Redact(pair.Value)),
        };

        var line = JsonSerializer.Serialize(record);
        lock (_gate)
        {
            try
            {
                File.AppendAllText(_path, line + Environment.NewLine, Encoding.UTF8);
            }
            catch (IOException)
            {
                // Logging must never take the application down.
            }
        }
    }

    public void Info(string eventName, IReadOnlyDictionary<string, string>? fields = null) =>
        Log(LogLevel.Information, eventName, fields);

    public void Warn(string eventName, IReadOnlyDictionary<string, string>? fields = null) =>
        Log(LogLevel.Warning, eventName, fields);

    public void Error(string eventName, Exception exception, IReadOnlyDictionary<string, string>? fields = null)
    {
        var merged = new Dictionary<string, string>(fields ?? new Dictionary<string, string>())
        {
            ["exception"] = $"{exception.GetType().Name}: {SecretRedactor.Redact(exception.Message)}",
        };

        Log(LogLevel.Error, eventName, merged);
    }

    public void Dispose()
    {
        // Nothing to release; the logger writes synchronously per record.
    }
}
