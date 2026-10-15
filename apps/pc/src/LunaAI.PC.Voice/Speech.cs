namespace LunaAI.PC.Voice;

public sealed record SpeechSynthesisResult(bool Spoken, string Detail);

/// <summary>
/// Speech output abstraction. The first release ships the interface plus an
/// explicit "unavailable" implementation; a Windows SAPI/OneCore voice engine can
/// be plugged in without touching the agent or the UI.
/// </summary>
public interface ISpeechSynthesizer
{
    bool IsAvailable { get; }

    string UnavailableReason { get; }

    Task<SpeechSynthesisResult> SpeakAsync(string text, string language, CancellationToken cancellationToken);

    void Stop();
}

public interface ISpeechRecognizer
{
    bool IsAvailable { get; }

    string UnavailableReason { get; }

    Task<string> ListenOnceAsync(string language, CancellationToken cancellationToken);
}

/// <summary>
/// Reports that speech is not configured. It never pretends to have spoken, so the
/// UI can state honestly that voice output is unavailable.
/// </summary>
public sealed class UnavailableSpeechSynthesizer : ISpeechSynthesizer
{
    public UnavailableSpeechSynthesizer(string reason) => UnavailableReason = reason;

    public bool IsAvailable => false;

    public string UnavailableReason { get; }

    public Task<SpeechSynthesisResult> SpeakAsync(string text, string language, CancellationToken cancellationToken) =>
        Task.FromResult(new SpeechSynthesisResult(false, UnavailableReason));

    public void Stop()
    {
    }
}

public sealed class UnavailableSpeechRecognizer : ISpeechRecognizer
{
    public UnavailableSpeechRecognizer(string reason) => UnavailableReason = reason;

    public bool IsAvailable => false;

    public string UnavailableReason { get; }

    public Task<string> ListenOnceAsync(string language, CancellationToken cancellationToken) =>
        throw new NotSupportedException(UnavailableReason);
}
