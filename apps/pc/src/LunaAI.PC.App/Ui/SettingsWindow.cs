using System.Windows;
using System.Windows.Controls;
using LunaAI.PC.Core.Configuration;

namespace LunaAI.PC.App.Ui;

/// <summary>
/// Native settings window: provider, permission level, approved folders,
/// privacy switches and interface language. Secrets are never stored here —
/// only the name of the environment variable that holds the API key.
/// </summary>
public sealed class SettingsWindow : Window
{
    private readonly DesktopAgentHost _host;
    private readonly Localization _localization;
    private readonly AppSettings _draft;

    private readonly TextBox _baseUrl = new();
    private readonly TextBox _model = new();
    private readonly TextBox _apiKeyVariable = new();
    private readonly CheckBox _useRemote = new();
    private readonly CheckBox _allowCommands = new();
    private readonly CheckBox _approveMedium = new();
    private readonly CheckBox _sendScreenshots = new();
    private readonly CheckBox _storeConversations = new();
    private readonly ComboBox _language = new();
    private readonly ListBox _roots = new();

    public SettingsWindow(DesktopAgentHost host)
    {
        _host = host ?? throw new ArgumentNullException(nameof(host));
        _localization = host.Localization;
        _draft = host.Settings.Clone();

        Title = _localization.T("pc.nav.settings");
        Width = 620;
        Height = 700;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        FlowDirection = _localization.IsRightToLeft ? FlowDirection.RightToLeft : FlowDirection.LeftToRight;

        Content = BuildLayout();
        LoadDraft();
    }

    private UIElement BuildLayout()
    {
        var root = new DockPanel { Margin = new Thickness(16) };

        var buttons = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
        };

        var save = new Button { Content = _localization.T("action.save") };
        save.Click += (_, _) =>
        {
            ApplyDraft();
            DialogResult = true;
        };

        var cancel = new Button { Content = _localization.T("action.cancel") };
        cancel.Click += (_, _) => DialogResult = false;

        buttons.Children.Add(save);
        buttons.Children.Add(cancel);
        DockPanel.SetDock(buttons, Dock.Bottom);
        root.Children.Add(buttons);

        var panel = new StackPanel();

        panel.Children.Add(Section(_localization.T("pc.settings.provider")));
        _useRemote.Content = _localization.T("pc.settings.provider.remote");
        panel.Children.Add(_useRemote);
        panel.Children.Add(Labeled("Base URL", _baseUrl));
        panel.Children.Add(Labeled("Model", _model));
        panel.Children.Add(Labeled("API key environment variable", _apiKeyVariable));
        panel.Children.Add(new TextBlock
        {
            Text = "The key itself is read from the environment and is never written to settings, logs or the audit log.",
            TextWrapping = TextWrapping.Wrap,
            Opacity = 0.7,
            Margin = new Thickness(2, 0, 2, 8),
        });

        panel.Children.Add(Section(_localization.T("pc.nav.permissions")));
        _allowCommands.Content = "Allow allow-listed command execution";
        _approveMedium.Content = "Ask for confirmation before medium-risk actions";
        panel.Children.Add(_allowCommands);
        panel.Children.Add(_approveMedium);

        panel.Children.Add(Section(_localization.T("pc.settings.dataDir")));
        panel.Children.Add(new TextBlock
        {
            Text = LunaAI.PC.Storage.AppPaths.DataDirectory,
            TextWrapping = TextWrapping.Wrap,
            Opacity = 0.7,
        });
        panel.Children.Add(new TextBlock
        {
            Text = "Approved folders (file tools can only touch these):",
            Margin = new Thickness(2, 8, 2, 2),
        });
        _roots.Height = 110;
        panel.Children.Add(_roots);

        var rootButtons = new StackPanel { Orientation = Orientation.Horizontal };
        var addRoot = new Button { Content = "Add folder…" };
        addRoot.Click += (_, _) => AddRoot();
        var removeRoot = new Button { Content = "Remove" };
        removeRoot.Click += (_, _) => RemoveRoot();
        rootButtons.Children.Add(addRoot);
        rootButtons.Children.Add(removeRoot);
        panel.Children.Add(rootButtons);

        panel.Children.Add(Section(_localization.T("pc.settings.privacy")));
        _sendScreenshots.Content = "Allow sending screenshots to a remote provider";
        panel.Children.Add(_sendScreenshots);
        _storeConversations.Content = "Store conversations on this computer";
        panel.Children.Add(_storeConversations);
        panel.Children.Add(new TextBlock
        {
            Text = _localization.T("pc.settings.privacy.notice"),
            TextWrapping = TextWrapping.Wrap,
            Opacity = 0.7,
        });

        panel.Children.Add(Section(_localization.T("language.label")));
        foreach (var (code, label) in new[]
        {
            ("en", _localization.T("language.english")),
            ("ja", _localization.T("language.japanese")),
            ("fa", _localization.T("language.persian")),
        })
        {
            _language.Items.Add(new ComboBoxItem { Content = label, Tag = code });
        }

        panel.Children.Add(_language);

        var scroll = new ScrollViewer { Content = panel, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        root.Children.Add(scroll);
        return root;
    }

    private static TextBlock Section(string title) => new()
    {
        Text = title,
        FontWeight = FontWeights.Bold,
        Margin = new Thickness(2, 14, 2, 4),
    };

    private static UIElement Labeled(string label, TextBox box)
    {
        var panel = new StackPanel();
        panel.Children.Add(new TextBlock { Text = label, Margin = new Thickness(2, 4, 2, 0) });
        panel.Children.Add(box);
        return panel;
    }

    private void LoadDraft()
    {
        _useRemote.IsChecked = _draft.Provider.Kind == ProviderKind.OpenAiCompatible;
        _baseUrl.Text = _draft.Provider.BaseUrl;
        _model.Text = _draft.Provider.Model;
        _apiKeyVariable.Text = _draft.Provider.ApiKeyEnvironmentVariable;
        _allowCommands.IsChecked = _draft.Agent.AllowCommandExecution;
        _approveMedium.IsChecked = _draft.Agent.RequireApprovalForMediumRisk;
        _sendScreenshots.IsChecked = _draft.Privacy.SendScreenshotsToProvider;
        _storeConversations.IsChecked = _draft.Privacy.StoreConversationsLocally;

        _language.SelectedIndex = _draft.UiLanguage switch
        {
            "ja" => 1,
            "fa" => 2,
            _ => 0,
        };

        foreach (var root in _draft.ApprovedRoots)
        {
            _roots.Items.Add(root);
        }
    }

    private void ApplyDraft()
    {
        _draft.Provider.Kind = _useRemote.IsChecked == true ? ProviderKind.OpenAiCompatible : ProviderKind.LocalEcho;
        _draft.Provider.BaseUrl = _baseUrl.Text.Trim();
        _draft.Provider.Model = _model.Text.Trim();
        _draft.Provider.ApiKeyEnvironmentVariable = _apiKeyVariable.Text.Trim();
        _draft.Agent.AllowCommandExecution = _allowCommands.IsChecked == true;
        _draft.Agent.RequireApprovalForMediumRisk = _approveMedium.IsChecked == true;
        _draft.Privacy.SendScreenshotsToProvider = _sendScreenshots.IsChecked == true;
        _draft.Privacy.StoreConversationsLocally = _storeConversations.IsChecked == true;

        if (_language.SelectedItem is ComboBoxItem item && item.Tag is string code)
        {
            _draft.UiLanguage = code;
        }

        _draft.ApprovedRoots.Clear();
        foreach (var root in _roots.Items)
        {
            if (root is string value && !string.IsNullOrWhiteSpace(value))
            {
                _draft.ApprovedRoots.Add(value);
            }
        }

        _host.ApplySettings(_draft);
    }

    private void AddRoot()
    {
        var picker = new Microsoft.Win32.OpenFolderDialog
        {
            Title = "Approve a folder for LunaAI PC file tools",
        };

        if (picker.ShowDialog(this) == true && !string.IsNullOrWhiteSpace(picker.FolderName))
        {
            if (!_roots.Items.Contains(picker.FolderName))
            {
                _roots.Items.Add(picker.FolderName);
            }
        }
    }

    private void RemoveRoot()
    {
        if (_roots.SelectedItem is not null)
        {
            _roots.Items.Remove(_roots.SelectedItem);
        }
    }
}
