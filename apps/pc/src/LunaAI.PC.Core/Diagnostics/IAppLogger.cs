namespace LunaAI.PC.Core.Diagnostics;

public enum LogLevel
{
    Debug,
    Information,
    Warning,
    Error,
}

/// <summary>
/// Structured logging abstraction. Implementations must redact secrets; the
/// <see cref="SecretRedactor"/> helper is provided for that purpose.
/// </summary>
public interface IAppLogger
{
    void Log(LogLevel level, string eventName, IReadOnlyDictionary<string, string>? fields = null);

    void Info(string eventName, IReadOnlyDictionary<string, string>? fields = null);

    void Warn(string eventName, IReadOnlyDictionary<string, string>? fields = null);

    void Error(string eventName, Exception exception, IReadOnlyDictionary<string, string>? fields = null);
}
