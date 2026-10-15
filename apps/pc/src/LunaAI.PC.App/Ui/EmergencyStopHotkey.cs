using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace LunaAI.PC.App.Ui;

/// <summary>
/// System-wide emergency-stop hotkey (Ctrl+Alt+Shift+S) registered with
/// RegisterHotKey, so the stop works even when another application has focus.
/// </summary>
public sealed class EmergencyStopHotkey : IDisposable
{
    private const int HotkeyId = 0x4C41; // "LA"
    private const int WmHotkey = 0x0312;
    private const uint ModAlt = 0x0001;
    private const uint ModControl = 0x0002;
    private const uint ModShift = 0x0004;

    private readonly Window _window;
    private HwndSource? _source;
    private bool _registered;

    public EmergencyStopHotkey(Window window, Action onTriggered)
    {
        _window = window ?? throw new ArgumentNullException(nameof(window));
        OnTriggered = onTriggered ?? throw new ArgumentNullException(nameof(onTriggered));
    }

    public Action OnTriggered { get; }

    /// <summary>True when the operating system accepted the hotkey registration.</summary>
    public bool IsRegistered => _registered;

    public void Register()
    {
        var handle = new WindowInteropHelper(_window).Handle;
        if (handle == IntPtr.Zero)
        {
            return;
        }

        _source = HwndSource.FromHwnd(handle);
        _source?.AddHook(WndProc);
        _registered = RegisterHotKey(handle, HotkeyId, ModControl | ModAlt | ModShift, 0x53 /* S */);
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WmHotkey && wParam.ToInt32() == HotkeyId)
        {
            OnTriggered();
            handled = true;
        }

        return IntPtr.Zero;
    }

    public void Dispose()
    {
        if (_registered)
        {
            var handle = new WindowInteropHelper(_window).Handle;
            if (handle != IntPtr.Zero)
            {
                UnregisterHotKey(handle, HotkeyId);
            }

            _registered = false;
        }

        _source?.RemoveHook(WndProc);
        _source = null;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint virtualKey);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr window, int id);
}
