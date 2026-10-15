using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text;

namespace LunaAI.PC.Computer.Windows;

/// <summary>Native Windows API surface used by the computer layer.</summary>
[SupportedOSPlatform("windows")]
internal static class NativeMethods
{
    internal const int SmCxVirtualScreen = 78;
    internal const int SmCyVirtualScreen = 79;

    internal const uint InputMouse = 0;
    internal const uint InputKeyboard = 1;

    internal const uint MouseEventMove = 0x0001;
    internal const uint MouseEventLeftDown = 0x0002;
    internal const uint MouseEventLeftUp = 0x0004;
    internal const uint MouseEventRightDown = 0x0008;
    internal const uint MouseEventRightUp = 0x0010;
    internal const uint MouseEventMiddleDown = 0x0020;
    internal const uint MouseEventMiddleUp = 0x0040;
    internal const uint MouseEventWheel = 0x0800;
    internal const uint MouseEventAbsolute = 0x8000;

    internal const uint KeyEventKeyUp = 0x0002;
    internal const uint KeyEventUnicode = 0x0004;

    [StructLayout(LayoutKind.Sequential)]
    internal struct Input
    {
        public uint Type;
        public InputUnion Union;
    }

    [StructLayout(LayoutKind.Explicit)]
    internal struct InputUnion
    {
        [FieldOffset(0)]
        public MouseInput Mouse;

        [FieldOffset(0)]
        public KeyboardInput Keyboard;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct MouseInput
    {
        public int Dx;
        public int Dy;
        public int MouseData;
        public uint Flags;
        public uint Time;
        public nint ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct KeyboardInput
    {
        public ushort VirtualKey;
        public ushort ScanCode;
        public uint Flags;
        public uint Time;
        public nint ExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    internal static extern uint SendInput(uint numberOfInputs, Input[] inputs, int sizeOfInputStructure);

    [DllImport("user32.dll")]
    internal static extern int GetSystemMetrics(int index);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    internal static extern nint GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    internal static extern int GetWindowTextW(nint window, StringBuilder text, int maxCount);

    [DllImport("user32.dll")]
    internal static extern bool SetForegroundWindow(nint window);

    [DllImport("user32.dll")]
    internal static extern bool IsWindowVisible(nint window);

    [DllImport("user32.dll")]
    internal static extern uint GetWindowThreadProcessId(nint window, out uint processId);

    [DllImport("user32.dll")]
    internal static extern bool EnumWindows(EnumWindowsCallback callback, nint parameter);

    internal delegate bool EnumWindowsCallback(nint window, nint parameter);

    internal readonly record struct ScreenBounds(int Left, int Top, int Width, int Height);

    internal static ScreenBounds GetVirtualScreenBounds()
    {
        const int SmXVirtualScreen = 76;
        const int SmYVirtualScreen = 77;
        const int SmCxVirtualScreenValue = 78;
        const int SmCyVirtualScreenValue = 79;

        return new ScreenBounds(
            GetSystemMetrics(SmXVirtualScreen),
            GetSystemMetrics(SmYVirtualScreen),
            Math.Max(1, GetSystemMetrics(SmCxVirtualScreenValue)),
            Math.Max(1, GetSystemMetrics(SmCyVirtualScreenValue)));
    }

    internal static string GetActiveWindowTitle()
    {
        var handle = GetForegroundWindow();
        if (handle == nint.Zero)
        {
            return string.Empty;
        }

        var buffer = new StringBuilder(512);
        var length = GetWindowTextW(handle, buffer, buffer.Capacity);
        return length > 0 ? buffer.ToString(0, length) : string.Empty;
    }

    internal static bool TryMapVirtualKey(string key, out ushort virtualKey)
    {
        virtualKey = 0;
        if (string.IsNullOrWhiteSpace(key))
        {
            return false;
        }

        var normalized = key.Trim().ToUpperInvariant();
        if (normalized.StartsWith("VK_", StringComparison.Ordinal))
        {
            if (Enum.TryParse<VirtualKeys>(normalized, ignoreCase: true, out var parsed))
            {
                virtualKey = (ushort)parsed;
                return true;
            }

            return false;
        }

        if (normalized.Length == 1)
        {
            var character = char.ToUpperInvariant(normalized[0]);
            virtualKey = character is >= 'A' and <= 'Z' or >= '0' and <= '9'
                ? (ushort)character
                : (ushort)0;
            return virtualKey != 0;
        }

        if (normalized.StartsWith('F') && int.TryParse(normalized[1..], out var functionKey) && functionKey is >= 1 and <= 24)
        {
            virtualKey = (ushort)(0x70 + functionKey - 1);
            return true;
        }

        return false;
    }

    /// <summary>A deliberately small subset of the Windows virtual-key codes.</summary>
    internal enum VirtualKeys
    {
        VK_RETURN = 0x0D,
        VK_ESCAPE = 0x1B,
        VK_SPACE = 0x20,
        VK_TAB = 0x09,
        VK_BACK = 0x08,
        VK_DELETE = 0x2E,
        VK_LEFT = 0x25,
        VK_UP = 0x26,
        VK_RIGHT = 0x27,
        VK_DOWN = 0x28,
        VK_HOME = 0x24,
        VK_END = 0x23,
        VK_PRIOR = 0x21,
        VK_NEXT = 0x22,
        VK_CONTROL = 0x11,
        VK_SHIFT = 0x10,
        VK_MENU = 0x12,
        VK_LWIN = 0x5B,
    }
}
