using LunaAI.PC.Security.Permissions;

namespace LunaAI.PC.Security.Audit;

/// <summary>
/// One append-only audit record. The audit log answers: which tool was requested,
/// what the decision was, why, and what happened.
/// </summary>
public sealed record AuditEvent(
    DateTimeOffset Timestamp,
    string Kind,
    string ToolName,
    PermissionOutcome? Decision,
    string Reason,
    RiskLevel? Risk,
    PermissionLevel Level,
    IReadOnlyDictionary<string, string> Details)
{
    public static AuditEvent PermissionDecided(
        string toolName,
        PermissionDecision decision,
        PermissionLevel level,
        IReadOnlyDictionary<string, string>? details = null) =>
        new(
            DateTimeOffset.Now,
            "permission.decision",
            toolName,
            decision.Outcome,
            decision.Reason,
            decision.Risk,
            level,
            details ?? new Dictionary<string, string>());

    public static AuditEvent Execution(
        string toolName,
        bool succeeded,
        string detail,
        PermissionLevel level,
        IReadOnlyDictionary<string, string>? details = null) =>
        new(
            DateTimeOffset.Now,
            succeeded ? "tool.executed" : "tool.failed",
            toolName,
            null,
            detail,
            null,
            level,
            details ?? new Dictionary<string, string>());
}

public interface IAuditLog
{
    void Record(AuditEvent auditEvent);

    IReadOnlyList<AuditEvent> Read(int maxEntries = 500);

    string FilePath { get; }
}
