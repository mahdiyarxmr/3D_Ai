using LunaAI.PC.Core.Configuration;

namespace LunaAI.PC.Security.Permissions;

/// <summary>
/// Central policy decision point.
///
/// Order of checks (all of them must pass):
///   1. emergency stop            → deny everything
///   2. unknown / unregistered    → deny (default deny)
///   3. permission level          → deny when the tool needs a higher level
///   4. file scope                → deny paths outside the approved roots
///   5. command policy            → deny disabled or unsafe commands
///   6. risk classification       → allow, or require explicit approval
///
/// No code path in this class can turn a denial into an approval.
/// </summary>
public sealed class PermissionManager : IPermissionManager
{
    private readonly object _gate = new();
    private readonly Dictionary<string, ToolDescriptor> _tools = new(StringComparer.OrdinalIgnoreCase);
    private readonly PathGuard _pathGuard;
    private readonly CommandGuard _commandGuard;
    private readonly Func<AgentSettings> _settingsAccessor;

    public PermissionManager(
        IEnumerable<string> approvedRoots,
        AgentSettings settings,
        EmergencyStop? emergencyStop = null,
        CommandGuard? commandGuard = null)
    {
        ArgumentNullException.ThrowIfNull(settings);

        _pathGuard = new PathGuard(approvedRoots);
        _commandGuard = commandGuard ?? new CommandGuard();
        _settingsAccessor = () => settings;
        EmergencyStop = emergencyStop ?? new EmergencyStop();
        Level = ParseLevel(settings.PermissionLevel);
    }

    public PermissionManager(Func<AgentSettings> settingsAccessor, PathGuard pathGuard, CommandGuard? commandGuard = null)
    {
        ArgumentNullException.ThrowIfNull(settingsAccessor);
        ArgumentNullException.ThrowIfNull(pathGuard);

        _settingsAccessor = settingsAccessor;
        _pathGuard = pathGuard;
        _commandGuard = commandGuard ?? new CommandGuard();
        EmergencyStop = new EmergencyStop();
        Level = ParseLevel(settingsAccessor().PermissionLevel);
    }

    public PermissionLevel Level { get; set; }

    public EmergencyStop EmergencyStop { get; }

    public PathGuard PathGuard => _pathGuard;

    public CommandGuard CommandGuard => _commandGuard;

    public static PermissionLevel ParseLevel(string value) => value?.ToLowerInvariant() switch
    {
        "observe" => PermissionLevel.Observe,
        "autonomous" => PermissionLevel.Autonomous,
        _ => PermissionLevel.Assist,
    };

    public void RegisterTool(ToolDescriptor descriptor)
    {
        ToolMetadataValidator.Validate(descriptor);

        lock (_gate)
        {
            _tools[descriptor.Name] = descriptor;
        }
    }

    public ToolDescriptor? FindTool(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return null;
        }

        lock (_gate)
        {
            return _tools.TryGetValue(name, out var descriptor) ? descriptor : null;
        }
    }

    public PermissionDecision Authorize(PermissionRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (EmergencyStop.IsEngaged)
        {
            return PermissionDecision.Deny(request.Tool.Name, request.Tool.Risk, "emergency_stop");
        }

        var registered = FindTool(request.Tool.Name);
        if (registered is null)
        {
            return PermissionDecision.Deny(request.Tool.Name, request.Tool.Risk, "unknown_tool");
        }

        var settings = _settingsAccessor();
        var level = request.Level;

        if (registered.MinimumLevel > level)
        {
            return PermissionDecision.Deny(request.Tool.Name, registered.Risk, "permission_level_too_low");
        }

        foreach (var pathRequest in request.Paths)
        {
            var validation = _pathGuard.Validate(pathRequest.Path, pathRequest.Access);
            if (!validation.IsAllowed)
            {
                return PermissionDecision.Deny(request.Tool.Name, registered.Risk, validation.Reason);
            }
        }

        if (registered.RequiresCommandExecution || request.Command is not null)
        {
            if (!settings.AllowCommandExecution)
            {
                return PermissionDecision.Deny(request.Tool.Name, registered.Risk, "command_execution_disabled");
            }

            var command = request.Command;
            if (command is null)
            {
                return PermissionDecision.Deny(request.Tool.Name, registered.Risk, "command_required");
            }

            var validation = _commandGuard.Validate(command.Executable, command.Arguments);
            if (!validation.IsAllowed)
            {
                return PermissionDecision.Deny(request.Tool.Name, registered.Risk, validation.Reason);
            }
        }

        if ((registered.Capabilities & ToolCapability.WriteFiles) != 0 && level == PermissionLevel.Observe)
        {
            return PermissionDecision.Deny(request.Tool.Name, registered.Risk, "observe_level_is_read_only");
        }

        if (registered.Risk == RiskLevel.Critical)
        {
            return PermissionDecision.NeedApproval(request.Tool.Name, registered.Risk, "critical_risk_requires_approval");
        }

        if (registered.Risk == RiskLevel.High)
        {
            return PermissionDecision.NeedApproval(request.Tool.Name, registered.Risk, "high_risk_requires_approval");
        }

        if (registered.Risk == RiskLevel.Medium &&
            (settings.RequireApprovalForMediumRisk || level != PermissionLevel.Autonomous))
        {
            return PermissionDecision.NeedApproval(request.Tool.Name, registered.Risk, "medium_risk_requires_approval");
        }

        return PermissionDecision.Allow(request.Tool.Name, registered.Risk);
    }
}
