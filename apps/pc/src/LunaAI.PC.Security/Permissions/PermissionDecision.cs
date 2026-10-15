namespace LunaAI.PC.Security.Permissions;

public enum PermissionOutcome
{
    Allowed,
    RequiresApproval,
    Denied,
}

/// <summary>
/// The result of a permission check. Every decision carries a machine-readable
/// reason so it can be written to the audit log and shown to the user.
/// </summary>
public sealed record PermissionDecision(
    PermissionOutcome Outcome,
    string Reason,
    string ToolName,
    RiskLevel Risk)
{
    public bool IsAllowed => Outcome == PermissionOutcome.Allowed;

    public static PermissionDecision Allow(string toolName, RiskLevel risk) =>
        new(PermissionOutcome.Allowed, "allowed", toolName, risk);

    public static PermissionDecision NeedApproval(string toolName, RiskLevel risk, string reason) =>
        new(PermissionOutcome.RequiresApproval, reason, toolName, risk);

    public static PermissionDecision Deny(string toolName, RiskLevel risk, string reason) =>
        new(PermissionOutcome.Denied, reason, toolName, risk);
}

/// <summary>Everything the manager needs to authorise a single tool invocation.</summary>
public sealed class PermissionRequest
{
    public required ToolDescriptor Tool { get; init; }

    public required PermissionLevel Level { get; init; }

    /// <summary>File system paths the invocation would touch (already parsed from the arguments).</summary>
    public IReadOnlyList<PathRequest> Paths { get; init; } = Array.Empty<PathRequest>();

    /// <summary>Command line, when the tool would execute a process.</summary>
    public CommandRequest? Command { get; init; }
}

public enum PathAccess
{
    Read,
    Write,
}

public sealed record PathRequest(string Path, PathAccess Access);

public sealed record CommandRequest(string Executable, string Arguments, string? WorkingDirectory);
