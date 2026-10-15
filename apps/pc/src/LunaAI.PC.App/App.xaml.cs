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

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        _host = new DesktopAgentHost();
        await _host.InitializeAsync().ConfigureAwait(true);

        _mainWindow = new MainWindow(_host);
        MainWindow = _mainWindow;
        _mainWindow.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _mainWindow?.Dispose();
        _host?.Dispose();
        base.OnExit(e);
    }
}
