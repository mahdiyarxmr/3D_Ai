using LunaAI.PC.Security.Permissions;

namespace LunaAI.PC.Agent;

public enum ApprovalOutcome
{
    ApprovedOnce,
    ApprovedForSession,

    /// <summary>The user declined this action; the agent must not perform it.</summary>
    Denied,
}

public sealed record ApprovalRequest(
    ToolDescriptor Tool,
    string ArgumentsJson,
    PermissionDecision Decision,
    string Summary);

/// <summary>
/// Implemented by the desktop UI. Tests provide a scripted implementation.
/// A denied request is final for that invocation.
/// </summary>
public interface IApprovalPrompt
{
    Task<ApprovalOutcome> RequestApprovalAsync(ApprovalRequest request, CancellationToken cancellationToken);

    /// <summary>
    /// True only for non-interactive hosts that have no user to ask (for example
    /// a test harness). The desktop application always returns false so that a
    /// human decides every approval.
    /// </summary>
    bool IsAutoApproving { get; }
}
