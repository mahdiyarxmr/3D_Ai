using LunaAI.PC.Agent.Tools;
using LunaAI.PC.Computer;
using LunaAI.PC.Security.Permissions;

namespace LunaAI.PC.Agent;

/// <summary>
/// Builds the tool registry for the desktop agent and registers the same
/// descriptors with the permission manager, which is what makes the
/// "default deny for unknown tools" rule effective.
/// </summary>
public static class ToolCatalog
{
    public static ToolRegistry Build(ComputerServices computer, IPermissionManager permissionManager, string? screenshotDirectory = null)
    {
        ArgumentNullException.ThrowIfNull(computer);
        ArgumentNullException.ThrowIfNull(permissionManager);

        var registry = new ToolRegistry();

        registry.Register(new ScreenCaptureTool(computer.Screen, screenshotDirectory));
        registry.Register(new ListDirectoryTool(computer.Files));
        registry.Register(new ReadFileTool(computer.Files));
        registry.Register(new WriteFileTool(computer.Files));
        registry.Register(new MovePathTool(computer.Files));
        registry.Register(new DeletePathTool(computer.Files));
        registry.Register(new RunCommandTool(computer.Processes));
        registry.Register(new MouseClickTool(computer.Input));
        registry.Register(new TypeTextTool(computer.Input));
        registry.Register(new PressKeyTool(computer.Input));
        registry.Register(new ListWindowsTool(computer.Applications));
        registry.Register(new LaunchApplicationTool(computer.Applications));

        foreach (var descriptor in registry.Descriptors())
        {
            permissionManager.RegisterTool(descriptor);
        }

        return registry;
    }

    public static IReadOnlyList<Core.Ai.ToolDefinition> Definitions(ToolRegistry registry) =>
        registry.List()
            .Select(tool => new Core.Ai.ToolDefinition(tool.Descriptor.Name, tool.Descriptor.Description, tool.ParametersJsonSchema))
            .ToList();
}
