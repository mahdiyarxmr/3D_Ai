namespace LunaAI.PC.Core.Models;

public enum ChatRole
{
    System,
    User,
    Assistant,
    Tool,
}

/// <summary>A single message in a conversation, as understood by every provider.</summary>
public sealed record ChatMessage(ChatRole Role, string Content, DateTimeOffset CreatedAt)
{
    public static ChatMessage User(string content) => new(ChatRole.User, content, DateTimeOffset.Now);

    public static ChatMessage Assistant(string content) => new(ChatRole.Assistant, content, DateTimeOffset.Now);

    public static ChatMessage System(string content) => new(ChatRole.System, content, DateTimeOffset.Now);

    public static ChatMessage Tool(string content) => new(ChatRole.Tool, content, DateTimeOffset.Now);
}
