namespace LunaAI.PC.Security.Permissions;

/// <summary>
/// User-selected permission level. Higher levels never disable security
/// controls; they only remove repetitive prompts for low-risk work.
/// </summary>
public enum PermissionLevel
{
    /// <summary>Observe only: read approved content, never change the computer.</summary>
    Observe = 0,

    /// <summary>Perform approved actions, asking before sensitive operations.</summary>
    Assist = 1,

    /// <summary>Run permitted multi-step tasks without prompting for low-risk actions.</summary>
    Autonomous = 2,
}

public enum RiskLevel
{
    Low = 0,
    Medium = 1,
    High = 2,
    Critical = 3,
}

[Flags]
public enum ToolCapability
{
    None = 0,
    ReadScreen = 1 << 0,
    ReadFiles = 1 << 1,
    WriteFiles = 1 << 2,
    ExecuteCommands = 1 << 3,
    ControlInput = 1 << 4,
    LaunchApplications = 1 << 5,
    ControlWindows = 1 << 6,
    Network = 1 << 7,
}
