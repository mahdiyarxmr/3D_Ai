using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using LunaAI.PC.Agent;
using LunaAI.PC.Core.Models;
using LunaAI.PC.Security.Permissions;
using LunaAI.PC.Security.Audit;

namespace LunaAI.PC.App.Ui;

/// <summary>
/// The LunaAI PC main window: a native WPF chat interface with a permission
/// selector, an activity/audit view, a settings entry and a global emergency stop.
/// </summary>
public sealed class MainWindow : Window, IDisposable
{
    private readonly DesktopAgentHost _host;
    private readonly Localization _localization;

    private readonly ListBox _conversationList = new();
    private readonly ListBox _transcript = new();
    private readonly ListBox _activity = new();
    private readonly ListBox _audit = new();
    private readonly TextBox _composer = new();
    private readonly ComboBox _permissionSelector = new();
    private readonly Button _emergencyStop = new();
    private readonly Button _send = new();
    private readonly Button _cancel = new();
    private readonly TextBlock _status = new();
    private readonly TextBlock _providerNotice = new();

    private Conversation? _activeConversation;
    private CancellationTokenSource? _turnCancellation;

    public MainWindow(DesktopAgentHost host)
    {
        _host = host ?? throw new ArgumentNullException(nameof(host));
        _localization = host.Localization;

        Title = _localization.T("pc.app.title");
        Width = 1180;
        Height = 760;
        MinWidth = 900;
        MinHeight = 600;
        FlowDirection = _localization.IsRightToLeft ? FlowDirection.RightToLeft : FlowDirection.LeftToRight;

        Content = BuildLayout();

        _host.ActivityPublished += OnActivityPublished;
        Loaded += OnLoaded;
    }

    private UIElement BuildLayout()
    {
        var root = new DockPanel();

        // ---- Toolbar -------------------------------------------------------
        var toolbar = new WrapPanel { Margin = new Thickness(8) };

        foreach (var level in new[] { PermissionLevel.Observe, PermissionLevel.Assist, PermissionLevel.Autonomous })
        {
            _permissionSelector.Items.Add(new ComboBoxItem
            {
                Content = _localization.T($"pc.permission.level.{level.ToString().ToLowerInvariant()}"),
                Tag = level,
            });
        }

        _permissionSelector.SelectedIndex = _host.Settings.Agent.PermissionLevel switch
        {
            "observe" => 0,
            "autonomous" => 2,
            _ => 1,
        };
        _permissionSelector.SelectionChanged += (_, _) => OnPermissionLevelChanged();

        _emergencyStop.Content = _localization.T("pc.emergencyStop");
        _emergencyStop.Background = Brushes.Firebrick;
        _emergencyStop.Foreground = Brushes.White;
        _emergencyStop.MinWidth = 150;
        _emergencyStop.Click += (_, _) => ToggleEmergencyStop();

        var settingsButton = new Button { Content = _localization.T("pc.nav.settings") };
        settingsButton.Click += (_, _) => OpenSettings();

        var speakButton = new Button { Content = "Speak" };
        speakButton.IsEnabled = _host.Speech.IsAvailable;
        speakButton.ToolTip = _host.Speech.IsAvailable ? string.Empty : $"Voice output unavailable: {_host.Speech.UnavailableReason}";
        speakButton.Click += async (_, _) => await SpeakLastMessageAsync().ConfigureAwait(true);

        toolbar.Children.Add(new TextBlock
        {
            Text = _localization.T("pc.nav.permissions") + ":",
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(4, 0, 0, 0),
        });
        toolbar.Children.Add(_permissionSelector);
        toolbar.Children.Add(_emergencyStop);
        toolbar.Children.Add(settingsButton);
        toolbar.Children.Add(speakButton);
        toolbar.Children.Add(_status);

        _providerNotice.Text = _host.Provider.IsDevelopmentProvider
            ? _localization.T("pc.settings.provider") + ": " + _host.Provider.DisplayName
            : _localization.T("pc.settings.provider") + ": " + _host.Provider.DisplayName;
        _providerNotice.Margin = new Thickness(8, 0, 0, 0);
        _providerNotice.VerticalAlignment = VerticalAlignment.Center;
        _providerNotice.Foreground = _host.Provider.IsDevelopmentProvider ? Brushes.DarkOrange : Brushes.DarkGreen;
        toolbar.Children.Add(_providerNotice);

        DockPanel.SetDock(toolbar, Dock.Top);
        root.Children.Add(toolbar);

        // ---- Contents ------------------------------------------------------
        var tabs = new TabControl();
        tabs.Items.Add(new TabItem { Header = _localization.T("pc.nav.chat"), Content = BuildChatArea() });
        tabs.Items.Add(new TabItem { Header = _localization.T("pc.nav.tasks"), Content = _activity });
        tabs.Items.Add(new TabItem { Header = _localization.T("pc.nav.audit"), Content = _audit });
        root.Children.Add(tabs);

        return root;
    }

    private UIElement BuildChatArea()
    {
        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(260) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        // Conversation column
        var left = new DockPanel { Margin = new Thickness(8) };
        var newConversation = new Button { Content = _localization.T("pc.nav.chat") + " +" };
        newConversation.Click += (_, _) => StartNewConversation();
        DockPanel.SetDock(newConversation, Dock.Top);
        left.Children.Add(newConversation);
        left.Children.Add(_conversationList);
        Grid.SetColumn(left, 0);
        grid.Children.Add(left);

        _conversationList.SelectionChanged += (_, _) =>
        {
            if (_conversationList.SelectedItem is Conversation conversation)
            {
                OpenConversation(conversation);
            }
        };

        // Transcript + composer
        var right = new DockPanel { Margin = new Thickness(8) };

        _transcript.FontFamily = new FontFamily("Consolas, Segoe UI");
        _transcript.VerticalContentAlignment = VerticalAlignment.Top;
        DockPanel.SetDock(_transcript, Dock.Top);
        right.Children.Add(_transcript);

        var composerArea = new DockPanel();
        DockPanel.SetDock(composerArea, Dock.Bottom);

        _composer.AcceptsReturn = true;
        _composer.TextWrapping = TextWrapping.Wrap;
        _composer.Height = 90;
        _composer.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;
        DockPanel.SetDock(_composer, Dock.Top);
        composerArea.Children.Add(_composer);

        var buttons = new StackPanel { Orientation = Orientation.Horizontal };
        _send.Content = _localization.T("chat.send");
        _send.Click += async (_, _) => await SendAsync().ConfigureAwait(true);
        _cancel.Content = _localization.T("action.cancel");
        _cancel.Click += (_, _) => CancelTurn();
        buttons.Children.Add(_send);
        buttons.Children.Add(_cancel);
        composerArea.Children.Add(buttons);

        right.Children.Add(composerArea);
        Grid.SetColumn(right, 1);
        grid.Children.Add(right);

        return grid;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        RefreshConversations();
        RefreshAudit();
        UpdateStatus();

        if (_host.Conversations.List().Count == 0)
        {
            StartNewConversation();
        }
        else
        {
            var first = _host.Conversations.List()[0];
            _conversationList.SelectedIndex = 0;
            OpenConversation(first);
        }
    }

    private void RefreshConversations()
    {
        _conversationList.Items.Clear();
        foreach (var conversation in _host.Conversations.List())
        {
            _conversationList.Items.Add(conversation);
        }

        _conversationList.DisplayMemberPath = nameof(Conversation.Title);
    }

    private void StartNewConversation()
    {
        var conversation = _host.StartConversation("New conversation");
        RefreshConversations();
        _conversationList.SelectedItem = conversation;
        OpenConversation(conversation);
    }

    private void OpenConversation(Conversation conversation)
    {
        _activeConversation = _host.Conversations.Find(conversation.Id) ?? conversation;
        _transcript.Items.Clear();
        foreach (var message in _activeConversation.Messages)
        {
            AppendTranscript(message.Role.ToString(), message.Content);
        }
    }

    private async Task SendAsync()
    {
        if (_activeConversation is null)
        {
            StartNewConversation();
        }

        var prompt = _composer.Text.Trim();
        if (prompt.Length == 0 || _activeConversation is null)
        {
            return;
        }

        _composer.Clear();
        AppendTranscript("You", prompt);
        _send.IsEnabled = false;
        _turnCancellation = new CancellationTokenSource();
        UpdateStatus();

        try
        {
            var result = await _host.SendAsync(_activeConversation.Id, prompt, _turnCancellation.Token).ConfigureAwait(true);
            if (!string.IsNullOrEmpty(result.AssistantText))
            {
                AppendTranscript("LunaAI", result.AssistantText);
            }
            else if (result.ToolInvocations > 0)
            {
                AppendTranscript("LunaAI", $"(executed {result.ToolInvocations} tool call(s); no text response)");
            }
        }
        catch (Exception exception)
        {
            AppendTranscript("Error", exception.Message);
        }
        finally
        {
            _turnCancellation?.Dispose();
            _turnCancellation = null;
            _send.IsEnabled = true;
            RefreshConversations();
            RefreshAudit();
            UpdateStatus();
        }
    }

    private void CancelTurn()
    {
        _turnCancellation?.Cancel();
        _host.CancelCurrentTurn();
    }

    private void OnPermissionLevelChanged()
    {
        if (_permissionSelector.SelectedItem is ComboBoxItem item && item.Tag is PermissionLevel level)
        {
            _host.SetPermissionLevel(level);
            UpdateStatus();
        }
    }

    private void ToggleEmergencyStop()
    {
        if (_host.PermissionManager.EmergencyStop.IsEngaged)
        {
            _host.DisengageEmergencyStop();
        }
        else
        {
            _host.EngageEmergencyStop();
            CancelTurn();
        }

        UpdateStatus();
        RefreshAudit();
    }

    private void UpdateStatus()
    {
        var stopped = _host.PermissionManager.EmergencyStop.IsEngaged;
        _status.Text = stopped
            ? _localization.T("pc.emergencyStop.engaged")
            : $"{_localization.T("pc.permission.level." + _host.PermissionManager.Level.ToString().ToLowerInvariant())}";
        _status.Foreground = stopped ? Brushes.Firebrick : Brushes.Black;
        _emergencyStop.Content = stopped
            ? _localization.T("pc.emergencyStop") + " ✓"
            : _localization.T("pc.emergencyStop");
    }

    private void RefreshAudit()
    {
        _audit.Items.Clear();
        var events = _host.AuditLog.Read(200);
        foreach (var auditEvent in events.Reverse())
        {
            _audit.Items.Add($"{auditEvent.Timestamp:HH:mm:ss} · {auditEvent.Kind} · {auditEvent.ToolName} · " +
                             $"{auditEvent.Decision} · {auditEvent.Reason}");
        }

        if (events.Count == 0)
        {
            _audit.Items.Add(_localization.T("pc.audit.empty"));
        }
    }

    private void OnActivityPublished(object? sender, AgentEvent agentEvent)
    {
        var line = $"{DateTime.Now:HH:mm:ss} · {agentEvent.Kind} · {agentEvent.ToolName} · {agentEvent.Detail}";
        _activity.Items.Insert(0, line);
        if (agentEvent.Kind == AgentEventKind.PermissionChecked && agentEvent.Decision == PermissionOutcome.Denied)
        {
            RefreshAudit();
        }
    }

    private void AppendTranscript(string speaker, string text)
    {
        _transcript.Items.Add($"{speaker}: {text}");
        _transcript.ScrollIntoView(_transcript.Items[^1]);
    }

    private async Task SpeakLastMessageAsync()
    {
        var last = _activeConversation?.Messages.LastOrDefault(message => message.Role == ChatRole.Assistant);
        if (last is null)
        {
            return;
        }

        var result = await _host.Speech.SpeakAsync(last.Content, _host.Settings.ConversationLanguage, CancellationToken.None).ConfigureAwait(true);
        if (!result.Spoken)
        {
            MessageBox.Show(result.Detail, _localization.T("pc.app.title"));
        }
    }

    private void OpenSettings()
    {
        var dialog = new SettingsWindow(_host) { Owner = this };
        if (dialog.ShowDialog() == true)
        {
            FlowDirection = _localization.IsRightToLeft ? FlowDirection.RightToLeft : FlowDirection.LeftToRight;
            Title = _localization.T("pc.app.title");
            UpdateStatus();
        }
    }

    public void Dispose()
    {
        _host.ActivityPublished -= OnActivityPublished;
        _turnCancellation?.Dispose();
    }
}
