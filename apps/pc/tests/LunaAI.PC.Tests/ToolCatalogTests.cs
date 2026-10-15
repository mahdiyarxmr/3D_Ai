using System.Text.Json;
using LunaAI.PC.Agent;
using LunaAI.PC.Computer;
using LunaAI.PC.Computer.Services;
using LunaAI.PC.Core.Configuration;
using LunaAI.PC.Security.Audit;
using LunaAI.PC.Security.Permissions;
using Xunit;

namespace LunaAI.PC.Tests;

public sealed class ToolCatalogTests : IDisposable
{
    private readonly string _root;
    private readonly PermissionManager _permissionManager;
    private readonly AgentSettings _settings;

    public ToolCatalogTests()
    {
        _root = Path.Combine(Path.GetTempPath(), "lunaai-catalog-" + Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(_root);
        _settings = new AgentSettings { PermissionLevel = "assist", AllowCommandExecution = false };
        _permissionManager = new PermissionManager(new[] { _root }, _settings);
    }

    private ComputerServices Computer() => new(
        new FakeScreenService(),
        new FakeInputService(),
        new FileSystemService(),
        new ProcessService(),
        new FakeApplicationService());

    [Fact]
    public void Catalog_registers_the_expected_tools_with_the_permission_manager()
    {
        var registry = ToolCatalog.Build(Computer(), _permissionManager, Path.Combine(_root, "screenshots"));

        var names = registry.Descriptors().Select(descriptor => descriptor.Name).OrderBy(name => name).ToArray();
        Assert.Equal(
            new[]
            {
                "capture_screen", "delete_path", "launch_application", "list_directory", "list_windows",
                "mouse_click", "move_path", "press_key", "read_file", "run_command", "type_text", "write_file",
            },
            names);

        foreach (var descriptor in registry.Descriptors())
        {
            Assert.NotNull(_permissionManager.FindTool(descriptor.Name));
        }
    }

    [Fact]
    public void Input_control_tools_always_require_approval_at_assist_level()
    {
        var registry = ToolCatalog.Build(Computer(), _permissionManager, Path.Combine(_root, "screenshots"));

        foreach (var name in new[] { "type_text", "mouse_click", "launch_application" })
        {
            var descriptor = registry.Find(name)!.Descriptor;
            var decision = _permissionManager.Authorize(new PermissionRequest
            {
                Tool = descriptor,
                Level = PermissionLevel.Assist,
            });

            Assert.NotEqual(PermissionOutcome.Allowed, decision.Outcome);
        }
    }

    [Fact]
    public async Task Screen_capture_writes_a_local_png_and_reports_metadata()
    {
        var directory = Path.Combine(_root, "screenshots");
        var registry = ToolCatalog.Build(Computer(), _permissionManager, directory);
        var tool = registry.Find("capture_screen")!;

        var context = new ToolInvocationContext { ConversationId = "c1", WorkspacePath = _root, Level = PermissionLevel.Observe };
        var result = await tool.InvokeAsync(context, JsonDocument.Parse("{}").RootElement, CancellationToken.None);

        Assert.True(result.Succeeded);
        using var document = JsonDocument.Parse(result.Output);
        var path = document.RootElement.GetProperty("Path").GetString()!;
        Assert.True(File.Exists(path));
        Assert.Equal(3, new FileInfo(path).Length);
    }

    [Fact]
    public async Task Command_execution_through_the_pipeline_is_denied_while_disabled()
    {
        var registry = ToolCatalog.Build(Computer(), _permissionManager, Path.Combine(_root, "screenshots"));
        var auditPath = Path.Combine(_root, "audit.jsonl");
        var pipeline = new ToolExecutionPipeline(
            registry,
            _permissionManager,
            new JsonlAuditLog(auditPath),
            new ApprovingApprovalPrompt(),
            settingsAccessor: () => _settings);

        var context = new ToolInvocationContext { ConversationId = "c1", WorkspacePath = _root, Level = PermissionLevel.Assist };
        var arguments = JsonDocument.Parse($"{{\"executable\": \"dotnet\", \"arguments\": \"build\", \"working_directory\": {JsonSerializer.Serialize(_root)}}}").RootElement;

        var result = await pipeline.ExecuteAsync("run_command", arguments, context, CancellationToken.None);

        Assert.False(result.Executed);
        Assert.Equal("command_execution_disabled", result.Decision.Reason);
    }

    [Fact]
    public async Task Command_execution_is_denied_when_arguments_are_destructive()
    {
        _settings.AllowCommandExecution = true;
        var registry = ToolCatalog.Build(Computer(), _permissionManager, Path.Combine(_root, "screenshots"));
        var auditPath = Path.Combine(_root, "audit2.jsonl");
        var pipeline = new ToolExecutionPipeline(
            registry,
            _permissionManager,
            new JsonlAuditLog(auditPath),
            new ApprovingApprovalPrompt(),
            settingsAccessor: () => _settings);

        var context = new ToolInvocationContext { ConversationId = "c1", WorkspacePath = _root, Level = PermissionLevel.Autonomous };
        var arguments = JsonDocument.Parse("{\"executable\": \"dotnet\", \"arguments\": \"build && echo hello\"}").RootElement;

        var result = await pipeline.ExecuteAsync("run_command", arguments, context, CancellationToken.None);

        Assert.False(result.Executed);
        Assert.Equal("shell_metacharacter_blocked", result.Decision.Reason);
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
}
