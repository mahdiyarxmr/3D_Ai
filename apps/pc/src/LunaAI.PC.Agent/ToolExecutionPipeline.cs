using System.Diagnostics;
using System.Text.Json;
using LunaAI.PC.Agent;
using LunaAI.PC.Core.Configuration;
using LunaAI.PC.Core.Diagnostics;
using LunaAI.PC.Security.Audit;
using LunaAI.PC.Security.Permissions;

namespace LunaAI.PC.Agent;

public sealed record ToolExecutionResult(
    bool Executed,
    bool Succeeded,
    string Output,
    PermissionDecision Decision);

/// <summary>
/// The controlled pipeline every computer action must pass through:
///
///   Observe → Plan → Check permissions → Check risk → Request approval if needed
///   → Execute → Record audit event → Verify result
///
/// No model output can skip a stage: the model only proposes a tool call, and this
/// class decides whether it may run.
/// </summary>
public sealed class ToolExecutionPipeline
{
    private readonly ToolRegistry _registry;
    private readonly IPermissionManager _permissionManager;
    private readonly IAuditLog _auditLog;
    private readonly IApprovalPrompt _approvalPrompt;
    private readonly IAgentEventSink _events;
    private readonly IAppLogger _logger;
    private readonly Func<AgentSettings> _settingsAccessor;
    private readonly HashSet<string> _sessionApprovals = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _approvalGate = new();

    public ToolExecutionPipeline(
        ToolRegistry registry,
        IPermissionManager permissionManager,
        IAuditLog auditLog,
        IApprovalPrompt approvalPrompt,
        IAgentEventSink? events = null,
        IAppLogger? logger = null,
        Func<AgentSettings>? settingsAccessor = null)
    {
        _registry = registry ?? throw new ArgumentNullException(nameof(registry));
        _permissionManager = permissionManager ?? throw new ArgumentNullException(nameof(permissionManager));
        _auditLog = auditLog ?? throw new ArgumentNullException(nameof(auditLog));
        _approvalPrompt = approvalPrompt ?? throw new ArgumentNullException(nameof(approvalPrompt));
        _events = events ?? NullAgentEventSink.Instance;
        _logger = logger ?? new NullLogger();
        _settingsAccessor = settingsAccessor ?? (() => new AgentSettings());
    }

    public async Task<ToolExecutionResult> ExecuteAsync(
        string toolName,
        JsonElement arguments,
        ToolInvocationContext context,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);

        var tool = _registry.Find(toolName);
        if (tool is null)
        {
            var denial = PermissionDecision.Deny(toolName, RiskLevel.High, "unknown_tool");
            RecordDecision(toolName, denial, context);
            _events.Publish(new AgentEvent(AgentEventKind.PermissionChecked, "unknown_tool", toolName, PermissionOutcome.Denied));
            return new ToolExecutionResult(false, false, string.Empty, denial);
        }

        var descriptor = tool.Descriptor;
        var request = ToolInvocationPlanner.BuildRequest(descriptor, arguments, context.Level);
        var decision = _permissionManager.Authorize(request);
        RecordDecision(toolName, decision, context);
        _events.Publish(new AgentEvent(
            AgentEventKind.PermissionChecked,
            decision.Reason,
            toolName,
            decision.Outcome));

        if (decision.Outcome == PermissionOutcome.Denied)
        {
            return new ToolExecutionResult(false, false, string.Empty, decision);
        }

        if (decision.Outcome == PermissionOutcome.RequiresApproval &&
            !HasSessionApproval(toolName) &&
            !_approvalPrompt.IsAutoApproving)
        {
            _events.Publish(new AgentEvent(AgentEventKind.ApprovalRequested, decision.Reason, toolName, decision.Outcome));
            var approval = await _approvalPrompt
                .RequestApprovalAsync(
                    new ApprovalRequest(descriptor, arguments.GetRawText(), decision, BuildSummary(descriptor, decision)),
                    cancellationToken)
                .ConfigureAwait(false);

            _events.Publish(new AgentEvent(AgentEventKind.ApprovalResolved, approval.ToString(), toolName, decision.Outcome));

            if (approval == ApprovalOutcome.Denied)
            {
                var denial = PermissionDecision.Deny(toolName, decision.Risk, "user_denied");
                RecordDecision(toolName, denial, context);
                return new ToolExecutionResult(false, false, string.Empty, denial);
            }

            if (approval == ApprovalOutcome.ApprovedForSession)
            {
                RememberSessionApproval(toolName);
            }
        }

        if (_permissionManager.EmergencyStop.IsEngaged)
        {
            var stopped = PermissionDecision.Deny(toolName, descriptor.Risk, "emergency_stop");
            RecordDecision(toolName, stopped, context);
            return new ToolExecutionResult(false, false, string.Empty, stopped);
        }

        _events.Publish(new AgentEvent(AgentEventKind.ToolStarted, descriptor.Name, descriptor.Name));
        var stopwatch = Stopwatch.StartNew();

        try
        {
            using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutSource.CancelAfter(TimeSpan.FromSeconds(Math.Max(1, _settingsAccessor().ToolTimeoutSeconds)));

            var result = await tool.InvokeAsync(context, arguments, timeoutSource.Token).ConfigureAwait(false);
            stopwatch.Stop();

            if (result.Succeeded)
            {
                _events.Publish(new AgentEvent(AgentEventKind.ToolCompleted, result.Output, descriptor.Name, null, result.Output));
            }
            else
            {
                _events.Publish(new AgentEvent(AgentEventKind.ToolFailed, result.Error ?? "tool_failed", descriptor.Name));
            }

            _auditLog.Record(AuditEvent.Execution(
                descriptor.Name,
                result.Succeeded,
                result.Succeeded ? "ok" : result.Error ?? "failed",
                context.Level,
                new Dictionary<string, string> { ["duration_ms"] = stopwatch.ElapsedMilliseconds.ToString() }));

            return new ToolExecutionResult(true, result.Succeeded, result.Output, decision);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            _auditLog.Record(AuditEvent.Execution(descriptor.Name, false, "timeout", context.Level));
            _events.Publish(new AgentEvent(AgentEventKind.ToolFailed, "tool_timeout", descriptor.Name));
            return new ToolExecutionResult(true, false, string.Empty, decision);
        }
        catch (Exception exception)
        {
            _logger.Error("tool.failed", exception, new Dictionary<string, string> { ["tool"] = descriptor.Name });
            _auditLog.Record(AuditEvent.Execution(descriptor.Name, false, exception.GetType().Name, context.Level));
            _events.Publish(new AgentEvent(AgentEventKind.ToolFailed, exception.GetType().Name, descriptor.Name));
            return new ToolExecutionResult(true, false, string.Empty, decision);
        }
    }

    /// <summary>Marks the verification stage of the pipeline after result inspection.</summary>
    public void RecordVerification(string toolName, string summary, PermissionLevel level)
    {
        _auditLog.Record(AuditEvent.Execution(toolName, true, $"verified:{summary}", level));
        _events.Publish(new AgentEvent(AgentEventKind.VerificationRecorded, summary, toolName));
    }

    private bool HasSessionApproval(string toolName)
    {
        lock (_approvalGate)
        {
            return _sessionApprovals.Contains(toolName);
        }
    }

    private void RememberSessionApproval(string toolName)
    {
        lock (_approvalGate)
        {
            _sessionApprovals.Add(toolName);
        }
    }

    private void RecordDecision(string toolName, PermissionDecision decision, ToolInvocationContext context) =>
        _auditLog.Record(AuditEvent.PermissionDecided(toolName, decision, context.Level));

    private static string BuildSummary(ToolDescriptor descriptor, PermissionDecision decision) =>
        $"{descriptor.Name} ({descriptor.Risk}) — {decision.Reason}";
}

internal sealed class NullLogger : IAppLogger
{
    public void Log(LogLevel level, string eventName, IReadOnlyDictionary<string, string>? fields = null)
    {
    }

    public void Info(string eventName, IReadOnlyDictionary<string, string>? fields = null)
    {
    }

    public void Warn(string eventName, IReadOnlyDictionary<string, string>? fields = null)
    {
    }

    public void Error(string eventName, Exception exception, IReadOnlyDictionary<string, string>? fields = null)
    {
    }
}
