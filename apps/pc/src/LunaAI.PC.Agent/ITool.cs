using System.Text.Json;
using LunaAI.PC.Security.Permissions;

namespace LunaAI.PC.Agent;

/// <summary>
/// A typed, auditable computer tool.
///
/// Tools never check permissions themselves: the agent pipeline authorises every
/// invocation through the permission manager before <see cref="InvokeAsync"/> is
/// reached. Implementations must therefore only perform the declared action.
/// </summary>
public interface ITool
{
    ToolDescriptor Descriptor { get; }

    string ParametersJsonSchema { get; }

    Task<ToolResult> InvokeAsync(ToolInvocationContext context, JsonElement arguments, CancellationToken cancellationToken);
}

public sealed record ToolResult(bool Succeeded, string Output, string? Error = null)
{
    public static ToolResult Ok(string output) => new(true, output);

    public static ToolResult Fail(string error) => new(false, string.Empty, error);
}

/// <summary>Per-invocation context handed to a tool.</summary>
public sealed class ToolInvocationContext
{
    public required string ConversationId { get; init; }

    public required string WorkspacePath { get; init; }

    public required PermissionLevel Level { get; init; }
}
