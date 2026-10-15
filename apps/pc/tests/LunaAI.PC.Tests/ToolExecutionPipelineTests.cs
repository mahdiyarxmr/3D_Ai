using System.Text.Json;
using LunaAI.PC.Agent;
using LunaAI.PC.Core.Configuration;
using LunaAI.PC.Security.Audit;
using LunaAI.PC.Security.Permissions;
using Xunit;

namespace LunaAI.PC.Tests;

public sealed class ToolExecutionPipelineTests : IDisposable
{
    private readonly string _root;
    private readonly string _auditPath;
    private readonly PermissionManager _permissionManager;
    private readonly ToolRegistry _registry;
    private readonly JsonlAuditLog _auditLog;
    private readonly AgentSettings _settings;

    public ToolExecutionPipelineTests()
    {
        _root = Path.Combine(Path.GetTempPath(), "lunaai-pipeline-" + Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(_root);
        _auditPath = Path.Combine(_root, "audit.jsonl");

        _settings = new AgentSettings { PermissionLevel = "assist", RequireApprovalForMediumRisk = true, AllowCommandExecution = false };
        _permissionManager = new PermissionManager(new[] { _root }, _settings);
        _registry = new ToolRegistry();
        _auditLog = new JsonlAuditLog(_auditPath);
    }

    private ToolInvocationContext Context() => new()
    {
        ConversationId = "conversation-1",
        WorkspacePath = _root,
        Level = PermissionLevel.Assist,
    };

    private static JsonElement Arguments(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private (ToolExecutionPipeline Pipeline, RecordingTool Tool) BuildPipeline(IApprovalPrompt prompt, ToolDescriptor descriptor)
    {
        var tool = new RecordingTool(descriptor);
        _registry.Register(tool);
        _permissionManager.RegisterTool(descriptor);

        var pipeline = new ToolExecutionPipeline(_registry, _permissionManager, _auditLog, prompt, settingsAccessor: () => _settings);
        return (pipeline, tool);
    }

    [Fact]
    public async Task Denied_tool_is_never_invoked_and_is_audited()
    {
        var descriptor = new ToolDescriptor("read_file", "read", RiskLevel.Low, PermissionLevel.Observe, ToolCapability.ReadFiles, RequiresFileAccess: true);
        var (pipeline, tool) = BuildPipeline(new DenyingApprovalPrompt(), descriptor);

        var result = await pipeline.ExecuteAsync(
            "read_file",
            Arguments($"{{\"path\": \"{Path.Combine(Path.GetTempPath(), "outside.txt").Replace("\\", "\\\\")}\"}}"),
            Context(),
            CancellationToken.None);

        Assert.False(result.Executed);
        Assert.Equal(0, tool.Invocations);
        Assert.Equal(PermissionOutcome.Denied, result.Decision.Outcome);

        var audit = _auditLog.Read();
        Assert.Contains(audit, entry => entry.ToolName == "read_file" && entry.Decision == PermissionOutcome.Denied);
    }

    [Fact]
    public async Task Unknown_tool_is_denied_without_any_handler_call()
    {
        var (pipeline, _) = BuildPipeline(new DenyingApprovalPrompt(), new ToolDescriptor("read_file", "read", RiskLevel.Low, PermissionLevel.Observe, ToolCapability.ReadFiles, RequiresFileAccess: true));

        var result = await pipeline.ExecuteAsync("run_command", Arguments("{}"), Context(), CancellationToken.None);

        Assert.False(result.Executed);
        Assert.Equal("unknown_tool", result.Decision.Reason);
    }

    [Fact]
    public async Task High_risk_tool_asks_for_approval_and_runs_only_after_approval()
    {
        var descriptor = new ToolDescriptor("write_file", "write", RiskLevel.High, PermissionLevel.Assist, ToolCapability.WriteFiles, RequiresFileAccess: true);
        var prompt = new ApprovingApprovalPrompt(ApprovalOutcome.ApprovedOnce);
        var (pipeline, tool) = BuildPipeline(prompt, descriptor);

        var result = await pipeline.ExecuteAsync(
            "write_file",
            Arguments($"{{\"path\": \"{Path.Combine(_root, "notes.txt").Replace("\\", "\\\\")}\", \"content\": \"hi\"}}"),
            Context(),
            CancellationToken.None);

        Assert.Equal(1, prompt.Requests);
        Assert.True(result.Executed);
        Assert.True(result.Succeeded);
        Assert.Equal(1, tool.Invocations);

        var audit = _auditLog.Read();
        Assert.Contains(audit, entry => entry.Kind == "tool.executed" && entry.ToolName == "write_file");
    }

    [Fact]
    public async Task Denying_the_approval_prevents_execution()
    {
        var descriptor = new ToolDescriptor("delete_path", "delete", RiskLevel.Critical, PermissionLevel.Assist, ToolCapability.WriteFiles, RequiresFileAccess: true);
        var prompt = new DenyingApprovalPrompt();
        var (pipeline, tool) = BuildPipeline(prompt, descriptor);

        var result = await pipeline.ExecuteAsync(
            "delete_path",
            Arguments($"{{\"path\": \"{Path.Combine(_root, "tmp.txt").Replace("\\", "\\\\")}\"}}"),
            Context(),
            CancellationToken.None);

        Assert.Equal(1, prompt.Requests);
        Assert.False(result.Executed);
        Assert.Equal(0, tool.Invocations);
        Assert.Equal("user_denied", result.Decision.Reason);
        Assert.Contains(_auditLog.Read(), entry => entry.Reason == "user_denied");
    }

    [Fact]
    public async Task Session_approval_is_remembered_for_later_invocations()
    {
        var descriptor = new ToolDescriptor("write_file", "write", RiskLevel.High, PermissionLevel.Assist, ToolCapability.WriteFiles, RequiresFileAccess: true);
        var prompt = new ApprovingApprovalPrompt(ApprovalOutcome.ApprovedForSession);
        var (pipeline, tool) = BuildPipeline(prompt, descriptor);
        var arguments = Arguments($"{{\"path\": \"{Path.Combine(_root, "a.txt").Replace("\\", "\\\\")}\", \"content\": \"x\"}}");

        await pipeline.ExecuteAsync("write_file", arguments, Context(), CancellationToken.None);
        await pipeline.ExecuteAsync("write_file", arguments, Context(), CancellationToken.None);

        Assert.Equal(1, prompt.Requests);
        Assert.Equal(2, tool.Invocations);
    }

    [Fact]
    public async Task Emergency_stop_prevents_execution_even_after_approval()
    {
        var descriptor = new ToolDescriptor("write_file", "write", RiskLevel.High, PermissionLevel.Assist, ToolCapability.WriteFiles, RequiresFileAccess: true);
        var (pipeline, tool) = BuildPipeline(new ApprovingApprovalPrompt(), descriptor);
        _permissionManager.EmergencyStop.Engage("test");

        var result = await pipeline.ExecuteAsync(
            "write_file",
            Arguments($"{{\"path\": \"{Path.Combine(_root, "a.txt").Replace("\\", "\\\\")}\", \"content\": \"x\"}}"),
            Context(),
            CancellationToken.None);

        Assert.False(result.Executed);
        Assert.Equal(0, tool.Invocations);
        Assert.Equal("emergency_stop", result.Decision.Reason);
    }

    [Fact]
    public async Task Tool_failures_are_recorded_but_do_not_throw()
    {
        var failing = new FailingTool();
        _registry.Register(failing);
        _permissionManager.RegisterTool(failing.Descriptor);
        var pipeline = new ToolExecutionPipeline(_registry, _permissionManager, _auditLog, new ApprovingApprovalPrompt(), settingsAccessor: () => _settings);

        var result = await pipeline.ExecuteAsync("failing_tool", Arguments("{}"), Context(), CancellationToken.None);

        Assert.True(result.Executed);
        Assert.False(result.Succeeded);
        Assert.Contains(_auditLog.Read(), entry => entry.Kind == "tool.failed" || entry.Reason == "tool_failed");
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(_root, true);
        }
        catch (IOException)
        {
        }
    }

    private sealed class FailingTool : ITool
    {
        public ToolDescriptor Descriptor { get; } = new("failing_tool", "always fails", RiskLevel.Low, PermissionLevel.Observe, ToolCapability.None);

        public string ParametersJsonSchema { get; } = "{\"type\": \"object\", \"properties\": {}}";

        public Task<ToolResult> InvokeAsync(ToolInvocationContext context, JsonElement arguments, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("boom");
    }
}
