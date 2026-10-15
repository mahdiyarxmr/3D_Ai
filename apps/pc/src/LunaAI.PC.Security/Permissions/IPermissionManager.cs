namespace LunaAI.PC.Security.Permissions;

public interface IPermissionManager
{
    /// <summary>The permission level currently selected by the user.</summary>
    PermissionLevel Level { get; set; }

    EmergencyStop EmergencyStop { get; }

    /// <summary>Authorises one tool invocation. Never executes anything.</summary>
    PermissionDecision Authorize(PermissionRequest request);

    /// <summary>Registers tool metadata for validation and later lookups.</summary>
    void RegisterTool(ToolDescriptor descriptor);

    ToolDescriptor? FindTool(string name);
}
