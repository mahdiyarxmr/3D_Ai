namespace LunaAI.PC.Core.Models;

public enum TaskStepStatus
{
    Planned,
    AwaitingApproval,
    Running,
    Completed,
    Failed,
    Denied,
    Cancelled,
}

public sealed class TaskStep
{
    public string Id { get; set; } = Guid.NewGuid().ToString("n");

    public string ToolName { get; set; } = string.Empty;

    public string ArgumentsJson { get; set; } = "{}";

    public string Description { get; set; } = string.Empty;

    public TaskStepStatus Status { get; set; } = TaskStepStatus.Planned;

    public string Result { get; set; } = string.Empty;
}

public sealed class TaskPlan
{
    public string Id { get; set; } = Guid.NewGuid().ToString("n");

    public string ConversationId { get; set; } = string.Empty;

    public string Goal { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.Now;

    public List<TaskStep> Steps { get; set; } = new();

    public bool Cancelled { get; set; }
}
