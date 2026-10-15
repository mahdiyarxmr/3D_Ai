using System.Windows;
using System.Windows.Forms;
using FormsMenuItem = System.Windows.Forms.ToolStripMenuItem;

namespace LunaAI.PC.App.Ui;

/// <summary>
/// Native notification-area entry (Shell_NotifyIcon through the WinForms
/// wrapper). It exposes the emergency stop, window visibility and exit, so a
/// user can always reach the safety control even when the window is hidden.
/// </summary>
public sealed class TrayIcon : IDisposable
{
    private readonly NotifyIcon _notifyIcon;
    private readonly DesktopAgentHost _host;
    private readonly Window _window;
    private readonly Localization _localization;

    public TrayIcon(Window window, DesktopAgentHost host, Localization localization)
    {
        _window = window ?? throw new ArgumentNullException(nameof(window));
        _host = host ?? throw new ArgumentNullException(nameof(host));
        _localization = localization ?? throw new ArgumentNullException(nameof(localization));

        var menu = new ContextMenuStrip();

        var showItem = new FormsMenuItem(localization.T("pc.tray.show")) { Font = new System.Drawing.Font(menu.Font, System.Drawing.FontStyle.Bold) };
        showItem.Click += (_, _) => Invoke(RestoreWindow);

        var stopItem = new FormsMenuItem(localization.T("pc.emergencyStop"));
        stopItem.Click += (_, _) => Invoke(() =>
        {
            _host.EngageEmergencyStop();
            _window.InvalidateVisual();
        });

        var resumeItem = new FormsMenuItem(localization.T("pc.emergencyStop.resume"));
        resumeItem.Click += (_, _) => Invoke(_host.DisengageEmergencyStop);

        var exitItem = new FormsMenuItem(_localization.T("pc.tray.exit"));
        exitItem.Click += (_, _) => Invoke(() => System.Windows.Application.Current?.Shutdown());

        menu.Items.Add(showItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(stopItem);
        menu.Items.Add(resumeItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(exitItem);

        _notifyIcon = new NotifyIcon
        {
            Visible = true,
            Icon = System.Drawing.SystemIcons.Shield,
            Text = localization.T("pc.app.title"),
            ContextMenuStrip = menu,
        };

        _notifyIcon.DoubleClick += (_, _) => Invoke(RestoreWindow);
    }

    public bool IsVisible => _notifyIcon.Visible;

    private void Invoke(Action action)
    {
        var dispatcher = _window.Dispatcher;
        if (dispatcher.CheckAccess())
        {
            action();
        }
        else
        {
            dispatcher.Invoke(action);
        }
    }

    private void RestoreWindow()
    {
        _window.Show();
        if (_window.WindowState == WindowState.Minimized)
        {
            _window.WindowState = WindowState.Normal;
        }

        _window.Activate();
    }

    public void Dispose()
    {
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
    }
}
