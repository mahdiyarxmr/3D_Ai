namespace LunaAI.PC.Computer.Services;

public sealed record ScreenshotResult(byte[] PngBytes, int Width, int Height, DateTimeOffset TakenAt, string ActiveWindowTitle);

public sealed record WindowInfo(string Title, string ProcessName, nint Handle);

public sealed record ProcessResult(int ExitCode, string StandardOutput, string StandardError, TimeSpan Duration)
{
    public bool Succeeded => ExitCode == 0;
}

public enum MouseButton
{
    Left,
    Right,
    Middle,
}

public interface IScreenService
{
    bool IsSupported { get; }

    Task<ScreenshotResult> CaptureAsync(CancellationToken cancellationToken);
}

public interface IInputService
{
    bool IsSupported { get; }

    Task MoveMouseAsync(int x, int y, CancellationToken cancellationToken);

    Task ClickAsync(MouseButton button, CancellationToken cancellationToken);

    Task TypeTextAsync(string text, CancellationToken cancellationToken);

    Task PressKeyAsync(string key, CancellationToken cancellationToken);

    Task ScrollAsync(int delta, CancellationToken cancellationToken);
}

public interface IFileSystemService
{
    IReadOnlyList<string> ListDirectory(string path);

    string ReadTextFile(string path, int maxBytes);

    void WriteTextFile(string path, string content);

    void CreateDirectory(string path);

    void MovePath(string source, string destination);

    void DeletePath(string path, bool recursive);
}

public interface IProcessService
{
    Task<ProcessResult> RunAsync(
        string executable,
        string arguments,
        string? workingDirectory,
        TimeSpan timeout,
        CancellationToken cancellationToken);
}

public interface IApplicationService
{
    bool IsSupported { get; }

    Task<int> LaunchAsync(string pathOrName, string arguments, CancellationToken cancellationToken);

    IReadOnlyList<WindowInfo> ListWindows();

    Task<bool> FocusWindowAsync(nint handle, CancellationToken cancellationToken);
}
