namespace LunaAI.PC.Core.Models;

/// <summary>A locally stored conversation. Conversations never leave this computer unless the user exports them.</summary>
public sealed class Conversation
{
    public string Id { get; set; } = Guid.NewGuid().ToString("n");

    public string Title { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.Now;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.Now;

    public string WorkspacePath { get; set; } = string.Empty;

    public List<ChatMessage> Messages { get; set; } = new();
}
