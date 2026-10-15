using LunaAI.PC.Security.Permissions;

namespace LunaAI.PC.Agent;

/// <summary>
/// The only place tools are looked up. A tool must be registered here *and*
/// authorised by the permission manager to run; there is no other execution path.
/// </summary>
public sealed class ToolRegistry
{
    private readonly Dictionary<string, ITool> _tools = new(StringComparer.OrdinalIgnoreCase);

    public void Register(ITool tool)
    {
        ArgumentNullException.ThrowIfNull(tool);
        ToolMetadataValidator.Validate(tool.Descriptor);

        if (_tools.ContainsKey(tool.Descriptor.Name))
        {
            throw new SecurityConfigurationException($"tool_already_registered:{tool.Descriptor.Name}");
        }

        _tools[tool.Descriptor.Name] = tool;
    }

    public ITool? Find(string name) =>
        string.IsNullOrWhiteSpace(name) ? null : _tools.TryGetValue(name, out var tool) ? tool : null;

    public IReadOnlyList<ITool> List() => _tools.Values.OrderBy(tool => tool.Descriptor.Name, StringComparer.Ordinal).ToList();

    public IReadOnlyList<ToolDescriptor> Descriptors() => List().Select(tool => tool.Descriptor).ToList();
}
