using System.Windows;
using LunaAI.PC.App.Ui;

namespace LunaAI.PC.App;

/// <summary>
/// LunaAI PC entry point. The application is a native WPF desktop application;
/// no HTML, CSS, JavaScript or embedded browser is used anywhere in this product.
/// </summary>
public partial class LunaApplication : Application
{
    private DesktopAgentHost? _host;
    private MainWindow? _mainWindow;
    private TrayIcon? _trayIcon;
    private EmergencyStopHotkey? _hotkey;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        _host = new DesktopAgentHost();
        await _host.InitializeAsync().ConfigureAwait(true);

        _mainWindow = new MainWindow(_host);
        MainWindow = _mainWindow;
        _mainWindow.Show();

        _trayIcon = new TrayIcon(_mainWindow, _host, _host.Localization);

        _hotkey = new EmergencyStopHotkey(_mainWindow, () =>
        {
            _host.EngageEmergencyStop();
            _host.CancelCurrentTurn();
            _mainWindow?.NotifyEmergencyStop();
        });
        _hotkey.Register();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _hotkey?.Dispose();
        _trayIcon?.Dispose();
        _mainWindow?.Dispose();
        _host?.Dispose();
        base.OnExit(e);
    }
}
