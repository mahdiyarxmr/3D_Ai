using System.Text.Json;
using LunaAI.PC.Agent;
using LunaAI.PC.Computer;
using LunaAI.PC.Core.Ai;
using LunaAI.PC.Core.Configuration;
using LunaAI.PC.Core.Models;
using LunaAI.PC.Security.Audit;
using LunaAI.PC.Security.Permissions;
using LunaAI.PC.Storage;
using Xunit;

namespace LunaAI.PC.Tests;

public sealed class AgentSessionTests : IDisposable
{
    private readonly string _root;
    private readonly string _dataDirectory;
    private readonly AppSettings _settings;
    private readonly PermissionManager _permissionManager;
    private readonly ToolRegistry _registry;
    private readonly JsonlAuditLog _auditLog;
    private readonly JsonConversationStore _conversations;

    public AgentSessionTests()
    {
        _root = Path.Combine(Path.GetTempPath(), "lunaai-agent-" + Guid.NewGuid().ToString("n"));
        _dataDirectory = Path.Combine(_root, "data");
        Directory.CreateDirectory(_root);
        Directory.CreateDirectory(_dataDirectory);
        Environment.SetEnvironmentVariable(AppPaths.DataDirectoryEnvironmentVariable, _dataDirectory);

        _settings = new AppSettings
        {
            ApprovedRoots = { _root },
            Agent = new AgentSettings { PermissionLevel = "assist", RequireApprovalForMediumRisk = true, AllowCommandExecution = false, MaxToolCallsPerTask = 3 },
        };

        _permissionManager = new PermissionManager(_settings.ApprovedRoots, _settings.Agent);
        _registry = new ToolRegistry();
        _auditLog = new JsonlAuditLog(Path.Combine(_dataDirectory, "audit.jsonl"));
        _conversations = new JsonConversationStore(Path.Combine(_dataDirectory, "conversations.json"));
    }

    private AgentSession BuildSession(IChatProvider provider, IApprovalPrompt prompt)
    {
        var pipeline = new ToolExecutionPipeline(_registry, _permissionManager, _auditLog, prompt, settingsAccessor: () => _settings.Agent);
        return new AgentSession(provider, _registry, pipeline, _conversations, _auditLog, () => _settings);
    }

    private Conversation CreateConversation() => _conversations.Create("New conversation", _root);

    [Fact]
    public async Task Denied_tool_calls_are_reported_to_the_model_and_never_executed()
    {
        var tool = new RecordingTool(new ToolDescriptor("write_file", "write", RiskLevel.High, PermissionLevel.Assist, ToolCapability.WriteFiles, RequiresFileAccess: true));
        _registry.Register(tool);
        _permissionManager.RegisterTool(tool.Descriptor);

        var outsidePath = JsonSerializer.Serialize(Path.Combine(Path.GetTempPath(), "outside", "x.txt"));
        var provider = new ScriptedProvider(new[]
        {
            ChatDelta.FromToolCall(new ToolCallRequest("call-1", "write_file", $"{{\"path\": {outsidePath}, \"content\": \"escape\"}}")),
            ChatDelta.FromText("I could not write that file."),
        });

        var conversation = CreateConversation();
        var session = BuildSession(provider, new ApprovingApprovalPrompt());
        var result = await session.SendAsync(conversation.Id, "write a file outside the workspace");

        Assert.Equal(1, result.ToolInvocations);
        Assert.Equal(0, tool.Invocations);

        var stored = _conversations.Find(conversation.Id)!;
        var toolMessage = stored.Messages.Last(message => message.Role == ChatRole.Tool);
        Assert.Contains("outside_approved_roots", toolMessage.Content);

        Assert.Contains(_auditLog.Read(), entry => entry.ToolName == "write_file" && entry.Decision == PermissionOutcome.Denied);
    }

    [Fact]
    public async Task Approved_tool_calls_execute_inside_the_approved_root()
    {
        var tool = new RecordingTool(new ToolDescriptor("write_file", "write", RiskLevel.High, PermissionLevel.Assist, ToolCapability.WriteFiles, RequiresFileAccess: true));
        _registry.Register(tool);
        _permissionManager.RegisterTool(tool.Descriptor);

        var insidePath = JsonSerializer.Serialize(Path.Combine(_root, "notes.txt"));
        var provider = new ScriptedProvider(new[]
        {
            ChatDelta.FromToolCall(new ToolCallRequest("call-1", "write_file", $"{{\"path\": {insidePath}, \"content\": \"hello\"}}")),
            ChatDelta.FromText("Done."),
        });

        var conversation = CreateConversation();
        var prompt = new ApprovingApprovalPrompt();
        var session = BuildSession(provider, prompt);
        var result = await session.SendAsync(conversation.Id, "save a note");

        Assert.Equal(1, result.ToolInvocations);
        Assert.Equal(1, tool.Invocations);
        Assert.Equal("Done.", result.AssistantText);
        Assert.Equal(1, prompt.Requests);
        Assert.Contains(_auditLog.Read(), entry => entry.Kind == "tool.executed");
    }

    [Fact]
    public async Task Tool_call_limit_is_enforced()
    {
        var tool = new RecordingTool(new ToolDescriptor("write_file", "write", RiskLevel.High, PermissionLevel.Assist, ToolCapability.WriteFiles, RequiresFileAccess: true));
        _registry.Register(tool);
        _permissionManager.RegisterTool(tool.Descriptor);

        var insidePath = JsonSerializer.Serialize(Path.Combine(_root, "notes.txt"));
        var script = new List<ChatDelta>();
        for (var index = 0; index < 5; index++)
        {
            script.Add(ChatDelta.FromToolCall(new ToolCallRequest($"call-{index}", "write_file", $"{{\"path\": {insidePath}, \"content\": \"{index}\"}}")));
        }

        script.Add(ChatDelta.FromText("stopped"));

        var conversation = CreateConversation();
        var session = BuildSession(new ScriptedProvider(script), new ApprovingApprovalPrompt());
        var result = await session.SendAsync(conversation.Id, "keep writing");

        Assert.True(result.HitToolLimit);
        Assert.True(result.ToolInvocations <= _settings.Agent.MaxToolCallsPerTask);
        Assert.True(tool.Invocations <= _settings.Agent.MaxToolCallsPerTask);
    }

    [Fact]
    public async Task Emergency_stop_blocks_all_tool_calls()
    {
        var tool = new RecordingTool(new ToolDescriptor("write_file", "write", RiskLevel.High, PermissionLevel.Assist, ToolCapability.WriteFiles, RequiresFileAccess: true));
        _registry.Register(tool);
        _permissionManager.RegisterTool(tool.Descriptor);
        _permissionManager.EmergencyStop.Engage("test");

        var insidePath = JsonSerializer.Serialize(Path.Combine(_root, "notes.txt"));
        var provider = new ScriptedProvider(new[]
        {
            ChatDelta.FromToolCall(new ToolCallRequest("call-1", "write_file", $"{{\"path\": {insidePath}, \"content\": \"hello\"}}")),
            ChatDelta.FromText("blocked"),
        });

        var conversation = CreateConversation();
        var session = BuildSession(provider, new ApprovingApprovalPrompt());
        await session.SendAsync(conversation.Id, "write anyway");

        Assert.Equal(0, tool.Invocations);
        Assert.Contains(_auditLog.Read(), entry => entry.Reason == "emergency_stop");
    }

    [Fact]
    public async Task Malformed_tool_arguments_are_rejected_without_execution()
    {
        var tool = new RecordingTool(new ToolDescriptor("write_file", "write", RiskLevel.High, PermissionLevel.Assist, ToolCapability.WriteFiles, RequiresFileAccess: true));
        _registry.Register(tool);
        _permissionManager.RegisterTool(tool.Descriptor);

        var provider = new ScriptedProvider(new[]
        {
            ChatDelta.FromToolCall(new ToolCallRequest("call-1", "write_file", "{not json")),
            ChatDelta.FromText("bad arguments"),
        });

        var conversation = CreateConversation();
        var session = BuildSession(provider, new ApprovingApprovalPrompt());
        await session.SendAsync(conversation.Id, "write something");

        Assert.Equal(0, tool.Invocations);
        Assert.Contains(_conversations.Find(conversation.Id)!.Messages, message => message.Content.Contains("invalid_tool_arguments"));
    }

    [Fact]
    public async Task Conversation_history_is_persisted_locally()
    {
        var provider = new ScriptedProvider(new[] { ChatDelta.FromText("Hello there.") });
        var conversation = CreateConversation();
        var session = BuildSession(provider, new ApprovingApprovalPrompt());

        await session.SendAsync(conversation.Id, "hi");

        var stored = _conversations.Find(conversation.Id)!;
        Assert.Contains(stored.Messages, message => message.Role == ChatRole.User && message.Content == "hi");
        Assert.Contains(stored.Messages, message => message.Role == ChatRole.Assistant && message.Content == "Hello there.");
        Assert.Equal("hi", stored.Title);
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable(AppPaths.DataDirectoryEnvironmentVariable, null);
        try
        {
            Directory.Delete(_root, true);
        }
        catch (IOException)
        {
        }
    }
}
