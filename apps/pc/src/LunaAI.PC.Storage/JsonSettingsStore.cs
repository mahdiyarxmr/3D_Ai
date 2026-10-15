using LunaAI.PC.Core.Configuration;

namespace LunaAI.PC.Storage;

public sealed class JsonSettingsStore : ISettingsStore
{
    private readonly string _path;

    public JsonSettingsStore(string? path = null)
    {
        _path = path ?? AppPaths.SettingsFile;
    }

    public string FilePath => _path;

    public AppSettings Load() => JsonDocumentStore.Read(_path, () => new AppSettings());

    public void Save(AppSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        JsonDocumentStore.Write(_path, settings);
    }
}
