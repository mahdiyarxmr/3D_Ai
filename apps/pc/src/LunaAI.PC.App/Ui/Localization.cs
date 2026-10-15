using System.IO;
using System.Text.Json;

namespace LunaAI.PC.App.Ui;

/// <summary>
/// Loads the shared locale files that ship next to the executable
/// (locales/{en,ja,fa}/common.json and pc.json).
///
/// The same files are the source of truth for LunaAI Web terminology, so both
/// products describe identical concepts with identical words.
/// </summary>
public sealed class Localization
{
    public static readonly string[] SupportedLanguages = { "en", "ja", "fa" };

    private readonly Dictionary<string, Dictionary<string, string>> _bundles;
    private string _language = "en";

    public Localization(string? localesRoot = null)
    {
        LocalesRoot = localesRoot ?? Path.Combine(AppContext.BaseDirectory, "locales");
        _bundles = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var language in SupportedLanguages)
        {
            _bundles[language] = Load(language);
        }
    }

    public string LocalesRoot { get; }

    public string Language
    {
        get => _language;
        set => _language = SupportedLanguages.Contains(value, StringComparer.OrdinalIgnoreCase) ? value : "en";
    }

    /// <summary>Right-to-left layout is required for Persian and only for Persian.</summary>
    public bool IsRightToLeft => string.Equals(_language, "fa", StringComparison.OrdinalIgnoreCase);

    public string T(string key, params (string Name, string Value)[] variables)
    {
        var template = Lookup(_language, key) ?? Lookup("en", key) ?? key;
        foreach (var (name, value) in variables)
        {
            template = template.Replace("{" + name + "}", value, StringComparison.Ordinal);
        }

        return template;
    }

    private string? Lookup(string language, string key)
    {
        if (!_bundles.TryGetValue(language, out var bundle))
        {
            return null;
        }

        return bundle.TryGetValue(key, out var value) ? value : null;
    }

    private Dictionary<string, string> Load(string language)
    {
        var merged = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var file in new[] { "common.json", "pc.json" })
        {
            var path = Path.Combine(LocalesRoot, language, file);
            if (!File.Exists(path))
            {
                continue;
            }

            try
            {
                using var document = JsonDocument.Parse(File.ReadAllText(path));
                foreach (var property in document.RootElement.EnumerateObject())
                {
                    if (property.Value.ValueKind == JsonValueKind.String)
                    {
                        merged[property.Name] = property.Value.GetString() ?? property.Name;
                    }
                }
            }
            catch (JsonException)
            {
                // A malformed locale file falls back to English rather than crashing the UI.
            }
        }

        return merged;
    }
}
