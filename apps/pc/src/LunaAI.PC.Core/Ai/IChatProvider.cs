using LunaAI.PC.Core.Models;

namespace LunaAI.PC.Core.Ai;

/// <summary>A tool definition offered to a model. Execution always happens in LunaAI PC, never inside the provider.</summary>
public sealed record ToolDefinition(string Name, string Description, string ParametersJsonSchema);

public sealed record ChatRequest(
    IReadOnlyList<ChatMessage> Messages,
    IReadOnlyList<ToolDefinition> Tools,
    string Model,
    bool AllowToolCalls);

/// <summary>An incremental piece of a model response.</summary>
public sealed record ChatDelta(string? Text, ToolCallRequest? ToolCall)
{
    public static ChatDelta FromText(string text) => new(text, null);

    public static ChatDelta FromToolCall(ToolCallRequest call) => new(null, call);
}

public sealed record ToolCallRequest(string Id, string Name, string ArgumentsJson);

/// <summary>
/// Provider-independent chat interface. Implementations must not execute tools and
/// must not have access to any local computer capability.
/// </summary>
public interface IChatProvider
{
    string Id { get; }

    string DisplayName { get; }

    /// <summary>True when the provider does not call a real model (used for honest UI labelling).</summary>
    bool IsDevelopmentProvider { get; }

    IAsyncEnumerable<ChatDelta> StreamAsync(ChatRequest request, CancellationToken cancellationToken);
}
