using System.Windows;
using LunaAI.PC.Agent;

namespace LunaAI.PC.App.Ui;

/// <summary>
/// Desktop approval prompt. When a window is available it shows a native modal
/// dialog; otherwise the request is denied (never silently approved).
/// </summary>
public sealed class WpfApprovalPrompt : IApprovalPrompt
{
    private readonly Localization _localization;

    public WpfApprovalPrompt(Localization localization)
    {
        _localization = localization;
    }

    /// <summary>Test/custom hook. The production path uses the modal dialog.</summary>
    public Func<ApprovalRequest, Task<ApprovalOutcome>>? Handler { get; set; }

    /// <summary>The desktop application always asks a human, so this is false.</summary>
    public bool IsAutoApproving => false;

    public Task<ApprovalOutcome> RequestApprovalAsync(ApprovalRequest request, CancellationToken cancellationToken)
    {
        if (Handler is not null)
        {
            return Handler(request);
        }

        var application = Application.Current;
        if (application is null)
        {
            return Task.FromResult(ApprovalOutcome.Denied);
        }

        return application.Dispatcher.InvokeAsync(() =>
        {
            var dialog = new ApprovalDialog(request, _localization)
            {
                Owner = application.MainWindow,
            };

            var result = dialog.ShowDialog();
            return result == true ? dialog.Outcome : ApprovalOutcome.Denied;
        }).Task;
    }
}
