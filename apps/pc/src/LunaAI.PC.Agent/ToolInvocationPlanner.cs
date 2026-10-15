using System.Text.Json;
using LunaAI.PC.Security.Permissions;

namespace LunaAI.PC.Agent;

/// <summary>
/// Translates a model tool call into the permission request the manager needs:
/// which tool, which paths, which command. Path and command extraction is done
/// here so the manager can run scope checks without knowing tool internals.
/// </summary>
public static class ToolInvocationPlanner
{
    public static PermissionRequest BuildRequest(
        ToolDescriptor descriptor,
        JsonElement arguments,
        PermissionLevel level)
    {
        ArgumentNullException.ThrowIfNull(descriptor);

        var paths = new List<PathRequest>();
        CommandRequest? command = null;

        foreach (var property in EnumerateProperties(arguments))
        {
            var name = property.Name.ToLowerInvariant();
            var value = property.Value.ValueKind == JsonValueKind.String ? property.Value.GetString() : null;

            if (IsPathArgument(name) && !string.IsNullOrWhiteSpace(value))
            {
                paths.Add(new PathRequest(value, IsWriteArgument(name) ? PathAccess.Write : PathAccess.Read));
            }
        }

        if ((descriptor.Capabilities & ToolCapability.ExecuteCommands) != 0)
        {
            var executable = ReadString(arguments, "executable");
            var argumentsText = ReadString(arguments, "arguments");
            var workingDirectory = ReadString(arguments, "working_directory");

            if (!string.IsNullOrWhiteSpace(executable))
            {
                command = new CommandRequest(executable, argumentsText ?? string.Empty, workingDirectory);
                if (!string.IsNullOrWhiteSpace(workingDirectory))
                {
                    paths.Add(new PathRequest(workingDirectory, PathAccess.Read));
                }
            }
        }

        return new PermissionRequest
        {
            Tool = descriptor,
            Level = level,
            Paths = paths,
            Command = command,
        };
    }

    private static IEnumerable<JsonProperty> EnumerateProperties(JsonElement arguments) =>
        arguments.ValueKind == JsonValueKind.Object ? arguments.EnumerateObject() : Array.Empty<JsonProperty>();

    private static bool IsPathArgument(string name) =>
        name is "path" or "paths" or "source" or "destination" or "file" or "directory" or "working_directory";

    private static bool IsWriteArgument(string name) =>
        name is "destination" or "file" or "directory";

    private static string? ReadString(JsonElement arguments, string name) =>
        arguments.ValueKind == JsonValueKind.Object &&
        arguments.TryGetProperty(name, out var value) &&
        value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}
