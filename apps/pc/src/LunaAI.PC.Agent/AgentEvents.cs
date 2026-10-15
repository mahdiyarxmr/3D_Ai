using LunaAI.PC.Security.Permissions;

namespace LunaAI.PC.Agent;

public enum AgentEventKind
{
    Started,
    ObservationRecorded,
    PlanCreated,
    PermissionChecked,
    ApprovalRequested,
    ApprovalResolved,
    ToolStarted,
    ToolCompleted,
    ToolFailed,
    VerificationRecorded,
    Completed,
    Aborted,
}

public sealed record AgentEvent(
    AgentEventKind Kind,
    string Detail,
    string? ToolName = null,
    PermissionOutcome? Decision = null,
    string? Payload = null);

/// <summary>Streams pipeline activity to the UI. Events never contain secrets.</summary>
public interface IAgentEventSink
{
    void Publish(AgentEvent agentEvent);
}

public sealed class NullAgentEventSink : IAgentEventSink
{
    public static readonly NullAgentEventSink Instance = new();

    public void Publish(AgentEvent agentEvent)
    {
    }
}
