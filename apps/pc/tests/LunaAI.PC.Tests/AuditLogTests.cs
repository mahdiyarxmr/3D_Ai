using LunaAI.PC.Security.Audit;
using LunaAI.PC.Security.Permissions;
using Xunit;

namespace LunaAI.PC.Tests;

public sealed class AuditLogTests : IDisposable
{
    private readonly string _directory;
    private readonly string _path;

    public AuditLogTests()
    {
        _directory = Path.Combine(Path.GetTempPath(), "lunaai-audit-" + Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(_directory);
        _path = Path.Combine(_directory, "audit.jsonl");
    }

    [Fact]
    public void Records_and_reads_back_events()
    {
        var log = new JsonlAuditLog(_path);
        log.Record(AuditEvent.Decision(
            "write_file",
            PermissionDecision.Deny("write_file", RiskLevel.High, "outside_approved_roots"),
            PermissionLevel.Assist));

        var events = log.Read();

        Assert.Single(events);
        Assert.Equal("write_file", events[0].ToolName);
        Assert.Equal(PermissionOutcome.Denied, events[0].Decision);
        Assert.Equal("outside_approved_roots", events[0].Reason);
    }

    [Fact]
    public void Redacts_secret_looking_values()
    {
        var log = new JsonlAuditLog(_path);
        log.Record(new AuditEvent(
            DateTimeOffset.Now,
            "tool.executed",
            "run_command",
            null,
            "api_key=sk-abcdef123456",
            RiskLevel.High,
            PermissionLevel.Assist,
            new Dictionary<string, string> { ["authorization"] = "Bearer sk-abcdef123456" }));

        var raw = File.ReadAllText(_path);

        Assert.DoesNotContain("sk-abcdef123456", raw);
        Assert.Contains("[redacted]", raw);
    }

    [Fact]
    public void Survives_a_corrupted_line()
    {
        File.WriteAllText(_path, "{not valid json}\n" +
            System.Text.Json.JsonSerializer.Serialize(new Dictionary<string, object?>
            {
                ["timestamp"] = DateTimeOffset.Now.ToString("o"),
                ["kind"] = "permission.decision",
                ["tool"] = "read_file",
                ["decision"] = "Allowed",
                ["reason"] = "allowed",
                ["risk"] = "Low",
                ["level"] = "Observe",
                ["details"] = new Dictionary<string, string>(),
            }) + "\n");

        var events = new JsonlAuditLog(_path).Read();

        Assert.Single(events);
        Assert.Equal("read_file", events[0].ToolName);
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(_directory, true);
        }
        catch (IOException)
        {
        }
    }
}
