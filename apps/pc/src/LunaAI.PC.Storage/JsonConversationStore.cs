using LunaAI.PC.Core.Models;

namespace LunaAI.PC.Storage;

public interface IConversationStore
{
    IReadOnlyList<Conversation> List();

    Conversation? Find(string id);

    Conversation Create(string title, string workspacePath);

    void Save(Conversation conversation);

    void AddMessage(string conversationId, ChatMessage message);

    void Rename(string conversationId, string title);

    bool Delete(string conversationId);
}

public sealed class JsonConversationStore : IConversationStore
{
    private readonly object _gate = new();
    private readonly string _path;
    private List<Conversation> _conversations;

    public JsonConversationStore(string? path = null)
    {
        _path = path ?? AppPaths.ConversationsFile;
        _conversations = JsonDocumentStore.Read(_path, () => new List<Conversation>());
    }

    public string FilePath => _path;

    public IReadOnlyList<Conversation> List()
    {
        lock (_gate)
        {
            return _conversations.OrderByDescending(conversation => conversation.UpdatedAt).ToList();
        }
    }

    public Conversation? Find(string id)
    {
        lock (_gate)
        {
            return _conversations.FirstOrDefault(conversation => conversation.Id == id);
        }
    }

    public Conversation Create(string title, string workspacePath)
    {
        var conversation = new Conversation
        {
            Title = string.IsNullOrWhiteSpace(title) ? "New conversation" : title,
            WorkspacePath = workspacePath ?? string.Empty,
        };

        lock (_gate)
        {
            _conversations.Add(conversation);
            Persist();
        }

        return conversation;
    }

    public void Save(Conversation conversation)
    {
        ArgumentNullException.ThrowIfNull(conversation);

        lock (_gate)
        {
            var index = _conversations.FindIndex(existing => existing.Id == conversation.Id);
            conversation.UpdatedAt = DateTimeOffset.Now;
            if (index >= 0)
            {
                _conversations[index] = conversation;
            }
            else
            {
                _conversations.Add(conversation);
            }

            Persist();
        }
    }

    public void AddMessage(string conversationId, ChatMessage message)
    {
        lock (_gate)
        {
            var conversation = _conversations.FirstOrDefault(existing => existing.Id == conversationId);
            if (conversation is null)
            {
                throw new InvalidOperationException($"Unknown conversation: {conversationId}");
            }

            conversation.Messages.Add(message);
            conversation.UpdatedAt = DateTimeOffset.Now;
            if (conversation.Title == "New conversation" && message.Role == ChatRole.User)
            {
                conversation.Title = message.Content.Length > 60 ? message.Content[..60] : message.Content;
            }

            Persist();
        }
    }

    public void Rename(string conversationId, string title)
    {
        lock (_gate)
        {
            var conversation = _conversations.FirstOrDefault(existing => existing.Id == conversationId);
            if (conversation is null)
            {
                return;
            }

            conversation.Title = title;
            conversation.UpdatedAt = DateTimeOffset.Now;
            Persist();
        }
    }

    public bool Delete(string conversationId)
    {
        lock (_gate)
        {
            var removed = _conversations.RemoveAll(conversation => conversation.Id == conversationId) > 0;
            if (removed)
            {
                Persist();
            }

            return removed;
        }
    }

    private void Persist() => JsonDocumentStore.Write(_path, _conversations);
}
