using LunaAI.PC.Computer;
using LunaAI.PC.Security.Permissions;
using Xunit;

namespace LunaAI.PC.Tests;

public sealed class PermissionManagerTests : IDisposable
{
    private readonly string _root;
    private readonly PermissionManager _manager;

    public PermissionManagerTests()
    {
        _root = Path.Combine(Path.GetTempPath(), "lunaai-tests-" + Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(_root);

        var settings = new Core.Configuration.AgentSettings
        {
            PermissionLevel = "assist",
            RequireApprovalForMediumRisk = true,
            AllowCommandExecution = false,
        };

        _manager = new PermissionManager(new[] { _root }, settings);
    }

    private static ToolDescriptor WriteTool(string name = "write_file") => new(
        name, "write", RiskLevel.High, PermissionLevel.Assist, ToolCapability.WriteFiles, RequiresFileAccess: true);

    private PermissionRequest RequestFor(ToolDescriptor descriptor, PermissionLevel level, params PathRequest[] paths) => new()
    {
        Tool = descriptor,
        Level = level,
        Paths = paths,
    };

    [Fact]
    public void Unknown_tools_are_denied_by_default()
    {
        var decision = _manager.Authorize(RequestFor(WriteTool("not_registered"), PermissionLevel.Autonomous));

        Assert.Equal(PermissionOutcome.Denied, decision.Outcome);
        Assert.Equal("unknown_tool", decision.Reason);
    }

    [Fact]
    public void Registered_high_risk_tools_require_approval_even_in_autonomous_mode()
    {
        var descriptor = WriteTool();
        _manager.RegisterTool(descriptor);

        var decision = _manager.Authorize(RequestFor(descriptor, PermissionLevel.Autonomous, new PathRequest(Path.Combine(_root, "a.txt"), PathAccess.Write)));

        Assert.Equal(PermissionOutcome.RequiresApproval, decision.Outcome);
        Assert.Equal("high_risk_requires_approval", decision.Reason);
    }

    [Fact]
    public void Observe_level_cannot_write_files()
    {
        var descriptor = WriteTool();
        _manager.RegisterTool(descriptor);

        var decision = _manager.Authorize(RequestFor(descriptor, PermissionLevel.Observe, new PathRequest(Path.Combine(_root, "a.txt"), PathAccess.Write)));

        Assert.Equal(PermissionOutcome.Denied, decision.Outcome);
        Assert.Contains(decision.Reason, new[] { "permission_level_too_low", "observe_level_is_read_only" });
    }

    [Fact]
    public void Low_risk_read_tools_are_allowed_without_approval_in_assist_mode()
    {
        var descriptor = new ToolDescriptor(
            "read_file", "read", RiskLevel.Low, PermissionLevel.Observe, ToolCapability.ReadFiles, RequiresFileAccess: true);
        _manager.RegisterTool(descriptor);

        var decision = _manager.Authorize(RequestFor(descriptor, PermissionLevel.Assist, new PathRequest(Path.Combine(_root, "a.txt"), PathAccess.Read)));

        Assert.Equal(PermissionOutcome.Allowed, decision.Outcome);
    }

    [Fact]
    public void Paths_outside_the_approved_roots_are_denied()
    {
        var descriptor = WriteTool();
        _manager.RegisterTool(descriptor);

        var outside = Path.Combine(Path.GetTempPath(), "not-approved", "a.txt");
        var decision = _manager.Authorize(RequestFor(descriptor, PermissionLevel.Assist, new PathRequest(outside, PathAccess.Write)));

        Assert.Equal(PermissionOutcome.Denied, decision.Outcome);
        Assert.Equal("outside_approved_roots", decision.Reason);
    }

    [Fact]
    public void Emergency_stop_blocks_every_tool_including_low_risk_reads()
    {
        var descriptor = new ToolDescriptor(
            "read_file", "read", RiskLevel.Low, PermissionLevel.Observe, ToolCapability.ReadFiles, RequiresFileAccess: true);
        _manager.RegisterTool(descriptor);

        _manager.EmergencyStop.Engage();

        var decision = _manager.Authorize(RequestFor(descriptor, PermissionLevel.Autonomous, new PathRequest(Path.Combine(_root, "a.txt"), PathAccess.Read)));

        Assert.Equal(PermissionOutcome.Denied, decision.Outcome);
        Assert.Equal("emergency_stop", decision.Reason);

        _manager.EmergencyStop.Disengage();
        var afterReset = _manager.Authorize(RequestFor(descriptor, PermissionLevel.Autonomous, new PathRequest(Path.Combine(_root, "a.txt"), PathAccess.Read)));
        Assert.Equal(PermissionOutcome.Allowed, afterReset.Outcome);
    }

    [Fact]
    public void Command_execution_is_denied_while_disabled()
    {
        var descriptor = new ToolDescriptor(
            "run_command", "run", RiskLevel.High, PermissionLevel.Assist, ToolCapability.ExecuteCommands, RequiresCommandExecution: true);
        _manager.RegisterTool(descriptor);

        var request = new PermissionRequest
        {
            Tool = descriptor,
            Level = PermissionLevel.Autonomous,
            Command = new CommandRequest("dotnet", "build", _root),
        };

        var decision = _manager.Authorize(request);
        Assert.Equal(PermissionOutcome.Denied, decision.Outcome);
        Assert.Equal("command_execution_disabled", decision.Reason);
    }

    [Fact]
    public void Metadata_that_hides_a_capability_is_rejected_at_registration()
    {
        // A tool that claims to be low risk while executing commands must never register.
        var inconsistent = new ToolDescriptor(
            "sneaky", "escalation attempt", RiskLevel.Low, PermissionLevel.Observe, ToolCapability.ExecuteCommands, RequiresCommandExecution: true);

        Assert.Throws<SecurityConfigurationException>(() => _manager.RegisterTool(inconsistent));
    }

    [Fact]
    public void Input_control_tools_must_require_assist_level()
    {
        var inconsistent = new ToolDescriptor(
            "type_text", "escalation attempt", RiskLevel.High, PermissionLevel.Observe, ToolCapability.ControlInput);

        Assert.Throws<SecurityConfigurationException>(() => _manager.RegisterTool(inconsistent));
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
