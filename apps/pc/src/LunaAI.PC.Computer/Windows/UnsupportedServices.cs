using LunaAI.PC.Computer.Services;

namespace LunaAI.PC.Computer.Windows;

/// <summary>
/// Used when a capability is unavailable on the current operating system.
/// It reports the limitation instead of pretending the action succeeded.
/// </summary>
public sealed class UnsupportedScreenService : IScreenService
{
    public bool IsSupported => false;

    public Task<ScreenshotResult> CaptureAsync(CancellationToken cancellationToken) =>
        throw new PlatformNotSupportedException("screen_capture_requires_windows");
}

public sealed class UnsupportedInputService : IInputService
{
    public bool IsSupported => false;

    public Task MoveMouseAsync(int x, int y, CancellationToken cancellationToken) =>
        throw new PlatformNotSupportedException("input_control_requires_windows");

    public Task ClickAsync(MouseButton button, CancellationToken cancellationToken) =>
        throw new PlatformNotSupportedException("input_control_requires_windows");

    public Task TypeTextAsync(string text, CancellationToken cancellationToken) =>
        throw new PlatformNotSupportedException("input_control_requires_windows");

    public Task PressKeyAsync(string key, CancellationToken cancellationToken) =>
        throw new PlatformNotSupportedException("input_control_requires_windows");

    public Task ScrollAsync(int delta, CancellationToken cancellationToken) =>
        throw new PlatformNotSupportedException("input_control_requires_windows");
}

public sealed class UnsupportedApplicationService : IApplicationService
{
    public bool IsSupported => false;

    public Task<int> LaunchAsync(string pathOrName, string arguments, CancellationToken cancellationToken) =>
        throw new PlatformNotSupportedException("application_launch_requires_windows");

    public IReadOnlyList<WindowInfo> ListWindows() => Array.Empty<WindowInfo>();

    public Task<bool> FocusWindowAsync(nint handle, CancellationToken cancellationToken) =>
        throw new PlatformNotSupportedException("window_control_requires_windows");
}
