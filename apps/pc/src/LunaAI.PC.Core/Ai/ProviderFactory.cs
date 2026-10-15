using LunaAI.PC.Core.Configuration;

namespace LunaAI.PC.Core.Ai;

/// <summary>Creates the configured provider. Never falls back silently to a remote provider.</summary>
public static class ProviderFactory
{
    public static IChatProvider Create(AppSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);

        if (settings.Provider.Kind == ProviderKind.LocalEcho)
        {
            return new LocalEchoProvider();
        }

        if (string.IsNullOrWhiteSpace(settings.Provider.BaseUrl))
        {
            return new LocalEchoProvider();
        }

        var apiKey = settings.Provider.ResolveApiKey();
        if (string.IsNullOrWhiteSpace(apiKey) && settings.Provider.RequiresApiKey)
        {
            // Without a key the remote endpoint would reject every call; use the
            // development provider and let the UI state that clearly.
            return new LocalEchoProvider();
        }

        return new OpenAiCompatibleProvider(settings.Provider.BaseUrl, apiKey);
    }
}
