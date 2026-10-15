using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.Versioning;
using System.Text;
using LunaAI.PC.Computer.Services;

namespace LunaAI.PC.Computer.Windows;

/// <summary>
/// Screen capture through the native Windows GDI APIs (no web technology, no
/// browser engine). Screenshots stay in memory unless the user enabled local
/// screen recording in the privacy settings.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class WindowsScreenService : IScreenService
{
    public bool IsSupported => OperatingSystem.IsWindows();

    public Task<ScreenshotResult> CaptureAsync(CancellationToken cancellationToken)
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("screen_capture_requires_windows");
        }

        return Task.Run(() =>
        {
            cancellationToken.ThrowIfCancellationRequested();

            var bounds = NativeMethods.GetVirtualScreenBounds();
            using var bitmap = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb);
            using (var graphics = Graphics.FromImage(bitmap))
            {
                graphics.CopyFromScreen(bounds.Left, bounds.Top, 0, 0, new Size(bounds.Width, bounds.Height), CopyPixelOperation.SourceCopy);
            }

            using var stream = new MemoryStream();
            bitmap.Save(stream, ImageFormat.Png);

            return new ScreenshotResult(
                stream.ToArray(),
                bounds.Width,
                bounds.Height,
                DateTimeOffset.Now,
                NativeMethods.GetActiveWindowTitle());
        }, cancellationToken);
    }
}
