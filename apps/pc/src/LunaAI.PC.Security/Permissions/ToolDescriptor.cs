namespace LunaAI.PC.Security.Permissions;

/// <summary>
/// Declared metadata for a tool. The permission manager trusts these declarations,
/// so <see cref="ToolMetadataValidator"/> enforces consistency at registration time.
/// </summary>
public sealed record ToolDescriptor(
    string Name,
    string Description,
    RiskLevel Risk,
    PermissionLevel MinimumLevel,
    ToolCapability Capabilities,
    bool RequiresFileAccess = false,
    bool RequiresCommandExecution = false);

public static class ToolMetadataValidator
{
    public static void Validate(ToolDescriptor descriptor)
    {
        ArgumentNullException.ThrowIfNull(descriptor);

        if (string.IsNullOrWhiteSpace(descriptor.Name))
        {
            throw new SecurityConfigurationException("tool_name_required");
        }

        if (descriptor.RequiresCommandExecution &&
            (descriptor.Capabilities & ToolCapability.ExecuteCommands) == 0)
        {
            throw new SecurityConfigurationException($"tool_capability_missing:execute:{descriptor.Name}");
        }

        if (descriptor.RequiresFileAccess &&
            (descriptor.Capabilities & (ToolCapability.ReadFiles | ToolCapability.WriteFiles)) == 0)
        {
            throw new SecurityConfigurationException($"tool_capability_missing:files:{descriptor.Name}");
        }

        if (descriptor.RequiresCommandExecution && descriptor.Risk == RiskLevel.Low)
        {
            throw new SecurityConfigurationException($"tool_risk_too_low:{descriptor.Name}");
        }

        if ((descriptor.Capabilities & ToolCapability.ControlInput) != 0 &&
            descriptor.MinimumLevel < PermissionLevel.Assist)
        {
            throw new SecurityConfigurationException($"tool_level_too_low:{descriptor.Name}");
        }

        if ((descriptor.Capabilities & ToolCapability.WriteFiles) != 0 &&
            descriptor.MinimumLevel < PermissionLevel.Assist)
        {
            throw new SecurityConfigurationException($"tool_level_too_low:{descriptor.Name}");
        }
    }
}

public sealed class SecurityConfigurationException : Exception
{
    public SecurityConfigurationException(string message) : base(message)
    {
    }
}
