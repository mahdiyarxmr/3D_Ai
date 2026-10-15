using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using LunaAI.PC.Computer.Services;

namespace LunaAI.PC.Computer.Windows;

/// <summary>
/// Mouse and keyboard control through the native SendInput API.
/// Input is synthesised by this process; nothing is delegated to a browser or
/// scripting host.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class WindowsInputService : IInputService
{
    public bool IsSupported => OperatingSystem.IsWindows();

    public Task MoveMouseAsync(int x, int y, CancellationToken cancellationToken)
    {
        EnsureWindows();
        cancellationToken.ThrowIfCancellationRequested();

        var screenWidth = NativeMethods.GetSystemMetrics(NativeMethods.SmCxVirtualScreen);
        var screenHeight = NativeMethods.GetSystemMetrics(NativeMethods.SmCyVirtualScreen);

        var absoluteX = (int)Math.Round(x * 65535.0 / Math.Max(1, screenWidth - 1));
        var absoluteY = (int)Math.Round(y * 65535.0 / Math.Max(1, screenHeight - 1));

        var input = new NativeMethods.Input
        {
            Type = NativeMethods.InputMouse,
            Union = new NativeMethods.InputUnion
            {
                Mouse = new NativeMethods.MouseInput
                {
                    Dx = absoluteX,
                    Dy = absoluteY,
                    Flags = NativeMethods.MouseEventMove | NativeMethods.MouseEventAbsolute,
                },
            },
        };

        Send(input);
        return Task.CompletedTask;
    }

    public Task ClickAsync(MouseButton button, CancellationToken cancellationToken)
    {
        EnsureWindows();
        cancellationToken.ThrowIfCancellationRequested();

        var (down, up) = button switch
        {
            MouseButton.Right => (NativeMethods.MouseEventRightDown, NativeMethods.MouseEventRightUp),
            MouseButton.Middle => (NativeMethods.MouseEventMiddleDown, NativeMethods.MouseEventMiddleUp),
            _ => (NativeMethods.MouseEventLeftDown, NativeMethods.MouseEventLeftUp),
        };

        Send(CreateMouseInput(down));
        Send(CreateMouseInput(up));
        return Task.CompletedTask;
    }

    public Task TypeTextAsync(string text, CancellationToken cancellationToken)
    {
        EnsureWindows();
        ArgumentNullException.ThrowIfNull(text);

        foreach (var character in text)
        {
            cancellationToken.ThrowIfCancellationRequested();
            SendCharacter(character, keyUp: false);
            SendCharacter(character, keyUp: true);
        }

        return Task.CompletedTask;
    }

    public Task PressKeyAsync(string key, CancellationToken cancellationToken)
    {
        EnsureWindows();
        cancellationToken.ThrowIfCancellationRequested();

        if (!NativeMethods.TryMapVirtualKey(key, out var virtualKey))
        {
            throw new ArgumentException($"unknown_key:{key}", nameof(key));
        }

        Send(CreateKeyboardInput(virtualKey, keyUp: false));
        Send(CreateKeyboardInput(virtualKey, keyUp: true));
        return Task.CompletedTask;
    }

    public Task ScrollAsync(int delta, CancellationToken cancellationToken)
    {
        EnsureWindows();
        cancellationToken.ThrowIfCancellationRequested();

        var input = new NativeMethods.Input
        {
            Type = NativeMethods.InputMouse,
            Union = new NativeMethods.InputUnion
            {
                Mouse = new NativeMethods.MouseInput
                {
                    MouseData = delta,
                    Flags = NativeMethods.MouseEventWheel,
                },
            },
        };

        Send(input);
        return Task.CompletedTask;
    }

    private static void EnsureWindows()
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("input_control_requires_windows");
        }
    }

    private static NativeMethods.Input CreateMouseInput(uint flags) => new()
    {
        Type = NativeMethods.InputMouse,
        Union = new NativeMethods.InputUnion { Mouse = new NativeMethods.MouseInput { Flags = flags } },
    };

    private static NativeMethods.Input CreateKeyboardInput(ushort virtualKey, bool keyUp) => new()
    {
        Type = NativeMethods.InputKeyboard,
        Union = new NativeMethods.InputUnion
        {
            Keyboard = new NativeMethods.KeyboardInput
            {
                VirtualKey = virtualKey,
                ScanCode = 0,
                Flags = keyUp ? NativeMethods.KeyEventKeyUp : 0,
            },
        },
    };

    private static void SendCharacter(char character, bool keyUp)
    {
        var input = new NativeMethods.Input
        {
            Type = NativeMethods.InputKeyboard,
            Union = new NativeMethods.InputUnion
            {
                Keyboard = new NativeMethods.KeyboardInput
                {
                    ScanCode = character,
                    Flags = NativeMethods.KeyEventUnicode | (keyUp ? NativeMethods.KeyEventKeyUp : 0),
                },
            },
        };

        Send(input);
    }

    private static void Send(NativeMethods.Input input)
    {
        var inputs = new[] { input };
        var size = Marshal.SizeOf<NativeMethods.Input>();
        var sent = NativeMethods.SendInput(1, inputs, size);
        if (sent == 0)
        {
            throw new InvalidOperationException("send_input_failed");
        }
    }
}
