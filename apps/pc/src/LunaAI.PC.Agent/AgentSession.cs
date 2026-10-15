using System.Text;
using System.Text.Json;
using LunaAI.PC.Core.Ai;
using LunaAI.PC.Core.Configuration;
using LunaAI.PC.Core.Diagnostics;
using LunaAI.PC.Core.Models;
using LunaAI.PC.Security.Audit;
using LunaAI.PC.Security.Permissions;
using LunaAI.PC.Storage;

namespace LunaAI.PC.Agent;

public sealed record AgentTurnResult(
    string AssistantText,
    int ToolInvocations,
    bool Aborted,
    bool HitToolLimit,
    IReadOnlyList<AgentEvent> Events);

/// <summary>
/// Runs one user turn: observe → plan (model) → permission/risk/approval →
/// execute → audit → verify, repeating while the model asks for tools.
///
/// The session owns cancellation; the emergency stop is checked before every
/// tool execution by the pipeline.
/// </summary>
public sealed class AgentSession
{
    private readonly IChatProvider _provider;
    private readonly ToolRegistry _registry;
    private readonly ToolExecutionPipeline _pipeline;
    private readonly IConversationStore _conversations;
    private readonly IAuditLog _auditLog;
    private readonly IAppLogger _logger;
    private readonly Func<AppSettings> _settingsAccessor;
    private readonly ITaskStore? _taskStore;
    private CancellationTokenSource? _currentTurn;
    private readonly List<AgentEvent> _recordedEvents = new();
    private readonly object _eventGate = new();

    public AgentSession(
        IChatProvider provider,
        ToolRegistry registry,
        ToolExecutionPipeline pipeline,
        IConversationStore conversations,
        IAuditLog auditLog,
        Func<AppSettings> settingsAccessor,
        IAppLogger? logger = null,
        ITaskStore? taskStore = null,
        IAgentEventSink? events = null)
    {
        _provider = provider ?? throw new ArgumentNullException(nameof(provider));
        _registry = registry ?? throw new ArgumentNullException(nameof(registry));
        _pipeline = pipeline ?? throw new ArgumentNullException(nameof(pipeline));
        _conversations = conversations ?? throw new ArgumentNullException(nameof(conversations));
        _auditLog = auditLog ?? throw new ArgumentNullException(nameof(auditLog));
        _settingsAccessor = settingsAccessor ?? throw new ArgumentNullException(nameof(settingsAccessor));
        _logger = logger ?? new NullLogger();
        _taskStore = taskStore;
        Sink = events ?? NullAgentEventSink.Instance;
    }

    /// <summary>Raised for every pipeline event so the UI can display activity live.</summary>
    public event EventHandler<AgentEvent>? EventPublished;

    public IAgentEventSink Sink { get; }

    public bool IsRunning => _currentTurn is not null && !_currentTurn.IsCancellationRequested;

    public void CancelCurrentTurn() => _currentTurn?.Cancel();

    public async Task<AgentTurnResult> SendAsync(string conversationId, string userPrompt, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(userPrompt))
        {
            throw new ArgumentException("A prompt is required.", nameof(userPrompt));
        }

        var conversation = _conversations.Find(conversationId)
            ?? throw new InvalidOperationException($"Unknown conversation: {conversationId}");

        var settings = _settingsAccessor();
        var level = PermissionManager.ParseLevel(settings.Agent.PermissionLevel);

        _conversations.AddMessage(conversationId, ChatMessage.User(userPrompt));
        conversation = _conversations.Find(conversationId)!;

        using var turnSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _currentTurn = turnSource;
        var events = new List<AgentEvent>();

        void Handle(AgentEvent agentEvent)
        {
            lock (_eventGate)
            {
                events.Add(agentEvent);
            }

            Sink.Publish(agentEvent);
            EventPublished?.Invoke(this, agentEvent);
        }

        Handle(new AgentEvent(AgentEventKind.Started, "turn started"));
        var plan = new TaskPlan { ConversationId = conversationId, Goal = userPrompt };
        var assistantText = new StringBuilder();
        var toolInvocations = 0;
        var aborted = false;
        var hitLimit = false;

        try
        {
            while (true)
            {
                if (turnSource.IsCancellationRequested)
                {
                    aborted = true;
                    break;
                }

                var request = new ChatRequest(
                    BuildHistory(conversation),
                    ToolCatalog.Definitions(_registry),
                    settings.Provider.Model,
                    AllowToolCalls: true);

                var pendingToolCalls = new List<ToolCallRequest>();

                await foreach (var delta in _provider.StreamAsync(request, turnSource.Token).ConfigureAwait(false))
                {
                    if (delta.Text is not null)
                    {
                        assistantText.Append(delta.Text);
                        Handle(new AgentEvent(AgentEventKind.PlanCreated, delta.Text));
                    }

                    if (delta.ToolCall is not null)
                    {
                        pendingToolCalls.Add(delta.ToolCall);
                    }
                }

                if (pendingToolCalls.Count == 0)
                {
                    break;
                }

                foreach (var call in pendingToolCalls)
                {
                    if (toolInvocations >= Math.Max(1, settings.Agent.MaxToolCallsPerTask))
                    {
                        hitLimit = true;
                        break;
                    }

                    toolInvocations++;
                    var step = new TaskStep
                    {
                        ToolName = call.Name,
                        ArgumentsJson = call.ArgumentsJson,
                        Description = call.Name,
                        Status = TaskStepStatus.Running,
                    };
                    plan.Steps.Add(step);

                    JsonElement arguments;
                    try
                    {
                        arguments = JsonDocument.Parse(string.IsNullOrWhiteSpace(call.ArgumentsJson) ? "{}" : call.ArgumentsJson).RootElement.Clone();
                    }
                    catch (JsonException)
                    {
                        step.Status = TaskStepStatus.Failed;
                        step.Result = "invalid_tool_arguments";
                        Handle(new AgentEvent(AgentEventKind.ToolFailed, "invalid_tool_arguments", call.Name));
                        _conversations.AddMessage(conversationId, ChatMessage.Tool($"{{\"error\":\"invalid_tool_arguments\",\"tool\":\"{call.Name}\"}}"));
                        continue;
                    }

                    var context = new ToolInvocationContext
                    {
                        ConversationId = conversationId,
                        WorkspacePath = conversation.WorkspacePath,
                        Level = level,
                    };

                    var result = await _pipeline.ExecuteAsync(call.Name, arguments, context, turnSource.Token).ConfigureAwait(false);
                    step.Status = result.Executed
                        ? (result.Succeeded ? TaskStepStatus.Completed : TaskStepStatus.Failed)
                        : (result.Decision.Reason == "user_denied" ? TaskStepStatus.Denied : TaskStepStatus.Denied);
                    step.Result = result.Succeeded ? Truncate(result.Output, 2000) : result.Decision.Reason;

                    Handle(new AgentEvent(
                        AgentEventKind.VerificationRecorded,
                        step.Status.ToString(),
                        call.Name,
                        result.Decision.Outcome));

                    var toolMessage = result.Succeeded
                        ? result.Output
                        : JsonSerializer.Serialize(new Dictionary<string, string>
                        {
                            ["error"] = result.Decision.Outcome == PermissionOutcome.Denied
                                ? result.Decision.Reason
                                : "tool_failed",
                        });

                    _conversations.AddMessage(conversationId, ChatMessage.Tool(Truncate(toolMessage, 8000)));
                    _pipeline.RecordVerification(call.Name, step.Status.ToString(), level);

                    if (hitLimit)
                    {
                        break;
                    }
                }

                if (hitLimit)
                {
                    Handle(new AgentEvent(AgentEventKind.Aborted, "tool_limit_reached"));
                    break;
                }
            }
        }
        catch (OperationCanceledException)
        {
            aborted = true;
            Handle(new AgentEvent(AgentEventKind.Aborted, "cancelled"));
        }
        catch (Exception exception)
        {
            _logger.Error("agent.turn_failed", exception);
            _auditLog.Record(AuditEvent.Execution("agent", false, exception.GetType().Name, level));
            Handle(new AgentEvent(AgentEventKind.Aborted, exception.GetType().Name));
            throw;
        }
        finally
        {
            _currentTurn = null;
        }

        var text = assistantText.ToString();
        if (!string.IsNullOrEmpty(text))
        {
            _conversations.AddMessage(conversationId, ChatMessage.Assistant(text));
        }

        plan.Cancelled = aborted;
        if (plan.Steps.Count > 0)
        {
            _taskStore?.Save(plan);
        }

        _auditLog.Record(AuditEvent.Execution(
            "agent.turn",
            !aborted,
            aborted ? "aborted" : "completed",
            level,
            new Dictionary<string, string> { ["conversation"] = conversationId, ["tools"] = toolInvocations.ToString() }));

        Handle(new AgentEvent(AgentEventKind.Completed, aborted ? "aborted" : "completed"));

        return new AgentTurnResult(text, toolInvocations, aborted, hitLimit, events);
    }

    private static IReadOnlyList<ChatMessage> BuildHistory(Conversation conversation)
    {
        var history = new List<ChatMessage>
        {
            ChatMessage.System(
                "You are LunaAI PC, a local desktop agent. You may only act through the tools you are given. " +
                "The permission system decides whether a tool call may run; a denied call must never be retried differently to bypass it."),
        };

        history.AddRange(conversation.Messages.TakeLast(40));
        return history;
    }

    private static string Truncate(string value, int max) =>
        string.IsNullOrEmpty(value) || value.Length <= max ? value : value[..max];
}
