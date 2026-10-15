using System.Collections.ObjectModel;
using System.IO;
using System.Windows.Threading;
using LunaAI.PC.Agent;
using LunaAI.PC.Computer;
using LunaAI.PC.Core.Ai;
using LunaAI.PC.Core.Configuration;
using LunaAI.PC.Core.Models;
using LunaAI.PC.Security.Audit;
using LunaAI.PC.Security.Permissions;
using LunaAI.PC.Storage;
using LunaAI.PC.Voice;

namespace LunaAI.PC.App.Ui;

/// <summary>
/// Composition root for the desktop application: settings, storage, security,
/// computer services, tools and the agent session are wired together here.
/// The UI never talks to a computer capability directly.
/// </summary>
public sealed class DesktopAgentHost : IDisposable
{
    private readonly Dispatcher _dispatcher;
    private AppSettings _settings = new();
    private ISettingsStore _settingsStore = null!;
    private PermissionManager _permissionManager = null!;
    private ComputerServices _computer = null!;
    private ToolRegistry _registry = null!;
    private ToolExecutionPipeline _pipeline = null!;
    private IConversationStore _conversations = null!;
    private ITaskStore _tasks = null!;
    private IAuditLog _auditLog = null!;
    private FileLogger _fileLogger = null!;
    private AgentSession _session = null!;
    private WpfApprovalPrompt _approvalPrompt = null!;
    private IChatProvider _provider = null!;

    public DesktopAgentHost(Dispatcher? dispatcher = null)
    {
        _dispatcher = dispatcher ?? Dispatcher.CurrentDispatcher;
    }

    public Localization Localization { get; } = new();

    public AppSettings Settings => _settings;

    public IAuditLog AuditLog => _auditLog;

    public PermissionManager PermissionManager => _permissionManager;

    public ToolRegistry ToolRegistry => _registry;

    public IConversationStore Conversations => _conversations;

    public ITaskStore Tasks => _tasks;

    public AgentSession Session => _session;

    public IChatProvider Provider => _provider;

    public ISpeechSynthesizer Speech { get; private set; } = new UnavailableSpeechSynthesizer("not_configured");

    public event EventHandler<AgentEvent>? ActivityPublished;

    public event EventHandler? SettingsChanged;

    public async Task InitializeAsync()
    {
        AppPaths.EnsureDirectories();

        _fileLogger = new FileLogger(AppPaths.LogFile);
        _settingsStore = new JsonSettingsStore();
        _settings = _settingsStore.Load();
        Localization.Language = _settings.UiLanguage;

        _conversations = new JsonConversationStore();
        _tasks = new JsonTaskStore();
        _auditLog = new JsonlAuditLog(AppPaths.AuditLogFile, _fileLogger);
        _computer = ComputerServices.CreateForCurrentPlatform();

        _permissionManager = new PermissionManager(_settings.ApprovedRoots, _settings.Agent);
        _permissionManager.Level = PermissionManager.ParseLevel(_settings.Agent.PermissionLevel);
        _permissionManager.EmergencyStop.Engaged += (_, reason) =>
        {
            _auditLog.Record(new AuditEvent(
                DateTimeOffset.Now,
                "emergency_stop.engaged",
                "system",
                PermissionOutcome.Denied,
                reason,
                RiskLevel.Critical,
                _permissionManager.Level,
                new Dictionary<string, string>()));
            _dispatcher.Invoke(() => ActivityPublished?.Invoke(this, new AgentEvent(AgentEventKind.Aborted, "emergency_stop")));
        };

        _registry = ToolCatalog.Build(_computer, _permissionManager, Path.Combine(AppPaths.DataDirectory, "screenshots"));
        _approvalPrompt = new WpfApprovalPrompt(Localization);
        _pipeline = new ToolExecutionPipeline(_registry, _permissionManager, _auditLog, _approvalPrompt, logger: _fileLogger, settingsAccessor: () => _settings.Agent);

        _provider = ProviderFactory.Create(_settings);
        _session = new AgentSession(
            _provider,
            _registry,
            _pipeline,
            _conversations,
            _auditLog,
            () => _settings,
            _fileLogger,
            _tasks);

        _session.EventPublished += (_, agentEvent) => _dispatcher.Invoke(() => ActivityPublished?.Invoke(this, agentEvent));
        _fileLogger.Info("app.started", new Dictionary<string, string>
        {
            ["provider"] = _provider.Id,
            ["permissionLevel"] = _settings.Agent.PermissionLevel,
            ["approvedRoots"] = _settings.ApprovedRoots.Count.ToString(),
        });

        await Task.CompletedTask.ConfigureAwait(false);
    }

    public ObservableCollection<Conversation> LoadConversations() => new(_conversations.List());

    public Conversation StartConversation(string title)
    {
        var workspace = string.IsNullOrWhiteSpace(_settings.WorkspacePath)
            ? _settings.ApprovedRoots.FirstOrDefault() ?? string.Empty
            : _settings.WorkspacePath;

        return _conversations.Create(title, workspace);
    }

    public Task<AgentTurnResult> SendAsync(string conversationId, string prompt, CancellationToken cancellationToken = default) =>
        _session.SendAsync(conversationId, prompt, cancellationToken);

    public void CancelCurrentTurn() => _session.CancelCurrentTurn();

    public void EngageEmergencyStop() => _permissionManager.EmergencyStop.Engage("user_requested");

    public void DisengageEmergencyStop() => _permissionManager.EmergencyStop.Disengage();

    public void SetPermissionLevel(PermissionLevel level)
    {
        _permissionManager.Level = level;
        _settings.Agent.PermissionLevel = level.ToString().ToLowerInvariant();
        PersistSettings();
    }

    public void ApplySettings(AppSettings updated)
    {
        _settings = updated;
        Localization.Language = _settings.UiLanguage;
        _permissionManager.Level = PermissionManager.ParseLevel(_settings.Agent.PermissionLevel);
        _provider = ProviderFactory.Create(_settings);
        PersistSettings();
        SettingsChanged?.Invoke(this, EventArgs.Empty);
    }

    public void PersistSettings() => _settingsStore.Save(_settings);

    public void SetApprovalPrompt(Func<Agent.ApprovalRequest, Task<ApprovalOutcome>> handler) =>
        _approvalPrompt.Handler = handler;

    public void Dispose()
    {
        _session.CancelCurrentTurn();
        (_provider as IDisposable)?.Dispose();
        _fileLogger.Dispose();
    }
}
