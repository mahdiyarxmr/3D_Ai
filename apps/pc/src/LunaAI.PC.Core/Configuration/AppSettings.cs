namespace LunaAI.PC.Core.Configuration;

public enum ProviderKind
{
    /// <summary>Development-only provider that never contacts a network service.</summary>
    LocalEcho,

    /// <summary>Any OpenAI-compatible HTTP endpoint, including locally hosted models.</summary>
    OpenAiCompatible,
}

public sealed class ProviderSettings
{
    public ProviderKind Kind { get; set; } = ProviderKind.LocalEcho;

    public string BaseUrl { get; set; } = "https://api.openai.com/v1";

    public string Model { get; set; } = "gpt-4o-mini";

    public bool RequiresApiKey { get; set; } = true;

    /// <summary>
    /// Name of the environment variable holding the API key. Secrets are never
    /// written to the settings file, to logs or to the audit log.
    /// </summary>
    public string ApiKeyEnvironmentVariable { get; set; } = "LUNAAI_PC_API_KEY";

    public string ResolveApiKey()
    {
        if (string.IsNullOrWhiteSpace(ApiKeyEnvironmentVariable))
        {
            return string.Empty;
        }

        return Environment.GetEnvironmentVariable(ApiKeyEnvironmentVariable) ?? string.Empty;
    }
}

public sealed class PrivacySettings
{
    public bool SendScreenshotsToProvider { get; set; }

    public bool SendFileContentsToProvider { get; set; }

    public bool RecordScreenLocally { get; set; } = true;

    public bool StoreConversationsLocally { get; set; } = true;

    public bool StoreAuditLogLocally { get; set; } = true;
}

public sealed class AgentSettings
{
    /// <summary>Permission level: observe, assist or autonomous.</summary>
    public string PermissionLevel { get; set; } = "assist";

    /// <summary>Maximum number of tool executions in a single task.</summary>
    public int MaxToolCallsPerTask { get; set; } = 25;

    /// <summary>Seconds before a single tool invocation is cancelled.</summary>
    public int ToolTimeoutSeconds { get; set; } = 120;

    public bool RequireApprovalForMediumRisk { get; set; } = true;

    public bool AllowCommandExecution { get; set; }
}

public sealed class AppSettings
{
    public string UiLanguage { get; set; } = "en";

    public string ConversationLanguage { get; set; } = "en";

    public string Theme { get; set; } = "system";

    public bool MinimizeToTray { get; set; } = true;

    public string WorkspacePath { get; set; } = string.Empty;

    /// <summary>Directories the user explicitly authorised for file operations.</summary>
    public List<string> ApprovedRoots { get; set; } = new();

    public ProviderSettings Provider { get; set; } = new();

    public PrivacySettings Privacy { get; set; } = new();

    public AgentSettings Agent { get; set; } = new();

    public AppSettings Clone()
    {
        var clone = (AppSettings)MemberwiseClone();
        clone.ApprovedRoots = new List<string>(ApprovedRoots);
        clone.Provider = new ProviderSettings
        {
            Kind = Provider.Kind,
            BaseUrl = Provider.BaseUrl,
            Model = Provider.Model,
            RequiresApiKey = Provider.RequiresApiKey,
            ApiKeyEnvironmentVariable = Provider.ApiKeyEnvironmentVariable,
        };
        clone.Privacy = new PrivacySettings
        {
            SendScreenshotsToProvider = Privacy.SendScreenshotsToProvider,
            SendFileContentsToProvider = Privacy.SendFileContentsToProvider,
            RecordScreenLocally = Privacy.RecordScreenLocally,
            StoreConversationsLocally = Privacy.StoreConversationsLocally,
            StoreAuditLogLocally = Privacy.StoreAuditLogLocally,
        };
        clone.Agent = new AgentSettings
        {
            PermissionLevel = Agent.PermissionLevel,
            MaxToolCallsPerTask = Agent.MaxToolCallsPerTask,
            ToolTimeoutSeconds = Agent.ToolTimeoutSeconds,
            RequireApprovalForMediumRisk = Agent.RequireApprovalForMediumRisk,
            AllowCommandExecution = Agent.AllowCommandExecution,
        };
        return clone;
    }
}

public interface ISettingsStore
{
    AppSettings Load();

    void Save(AppSettings settings);
}
