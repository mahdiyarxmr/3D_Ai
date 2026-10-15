using System.Runtime.CompilerServices;
using LunaAI.PC.Core.Models;

namespace LunaAI.PC.Core.Ai;

/// <summary>
/// Development provider used when no AI provider is configured.
/// It never contacts a network service and is always labelled as a development
/// provider in the UI, so it can never be mistaken for a real model.
/// </summary>
public sealed class LocalEchoProvider : IChatProvider
{
    public string Id => "local-echo";

    public string DisplayName => "Development provider (no model configured)";

    public bool IsDevelopmentProvider => true;

    public async IAsyncEnumerable<ChatDelta> StreamAsync(
        ChatRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var lastUser = request.Messages.LastOrDefault(message => message.Role == ChatRole.User);
        var text = string.Join(
            Environment.NewLine,
            "[development provider — no AI provider configured]",
            $"Conversation messages: {request.Messages.Count}",
            lastUser is null ? "No user message." : $"Last user message: {Truncate(lastUser.Content, 500)}");

        foreach (var chunk in Chunk(text, 12))
        {
            cancellationToken.ThrowIfCancellationRequested();
            await Task.Delay(10, cancellationToken).ConfigureAwait(false);
            yield return ChatDelta.FromText(chunk);
        }
    }

    internal static IEnumerable<string> Chunk(string text, int size)
    {
        for (var index = 0; index < text.Length; index += size)
        {
            yield return text.Substring(index, Math.Min(size, text.Length - index));
        }
    }

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max] + "…";
}
