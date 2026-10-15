using System.Text.RegularExpressions;

namespace LunaAI.PC.Core.Diagnostics;

/// <summary>
/// Removes secret-looking values before they can reach a log file or the audit log.
/// Applied to every logged field, message and exception text.
/// </summary>
public static partial class SecretRedactor
{
    public const string Placeholder = "[redacted]";

    public static string Redact(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var redacted = ApiKeyPattern().Replace(value, Placeholder);
        redacted = BearerPattern().Replace(redacted, $"Bearer {Placeholder}");
        redacted = KeyValuePattern().Replace(redacted, match => $"{match.Groups[1].Value}={Placeholder}");
        return redacted;
    }

    [GeneratedRegex(@"sk-[A-Za-z0-9_\-]{8,}", RegexOptions.Compiled)]
    private static partial Regex ApiKeyPattern();

    [GeneratedRegex(@"(?i)bearer\s+[A-Za-z0-9._\-]{8,}", RegexOptions.Compiled)]
    private static partial Regex BearerPattern();

    [GeneratedRegex(@"(?i)\b(api[_-]?key|token|password|secret|authorization)\b\s*[:=]\s*\S+", RegexOptions.Compiled)]
    private static partial Regex KeyValuePattern();
}
