using System.Diagnostics;
using System.Runtime.Versioning;
using System.Text;
using LunaAI.PC.Computer.Services;

namespace LunaAI.PC.Computer.Windows;

/// <summary>
/// Application launching and window inspection through native Windows APIs.
/// Launch requests are validated by the permission manager before they arrive
/// here; this class performs the raw OS call only.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class WindowsApplicationService : IApplicationService
{
    public bool IsSupported => OperatingSystem.IsWindows();

    public Task<int> LaunchAsync(string pathOrName, string arguments, CancellationToken cancellationToken)
    {
        EnsureWindows();
        cancellationToken.ThrowIfCancellationRequested();

        var startInfo = new ProcessStartInfo
        {
            FileName = pathOrName,
            Arguments = arguments ?? string.Empty,
            UseShellExecute = false,
            CreateNoWindow = false,
        };

        using var process = Process.Start(startInfo);
        if (process is null)
        {
            throw new InvalidOperationException("launch_failed");
        }

        return Task.FromResult(process.Id);
    }

    public IReadOnlyList<WindowInfo> ListWindows()
    {
        if (!OperatingSystem.IsWindows())
        {
            return Array.Empty<WindowInfo>();
        }

        var windows = new List<WindowInfo>();
        NativeMethods.EnumWindows((handle, _) =>
        {
            if (!NativeMethods.IsWindowVisible(handle))
            {
                return true;
            }

            var buffer = new StringBuilder(512);
            var length = NativeMethods.GetWindowTextW(handle, buffer, buffer.Capacity);
            if (length <= 0)
            {
                return true;
            }

            NativeMethods.GetWindowThreadProcessId(handle, out var processId);
            var processName = string.Empty;
            try
            {
                processName = Process.GetProcessById((int)processId).ProcessName;
            }
            catch (ArgumentException)
            {
                processName = "unknown";
            }
            catch (InvalidOperationException)
            {
                processName = "unknown";
            }

            windows.Add(new WindowInfo(buffer.ToString(0, length), processName, handle));
            return true;
        }, nint.Zero);

        return windows;
    }

    public Task<bool> FocusWindowAsync(nint handle, CancellationToken cancellationToken)
    {
        EnsureWindows();
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(NativeMethods.SetForegroundWindow(handle));
    }

    private static void EnsureWindows()
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("application_launch_requires_windows");
        }
    }
}
