using System.Windows;
using System.Windows.Controls;
using LunaAI.PC.Agent;

namespace LunaAI.PC.App.Ui;

/// <summary>
/// Native approval dialog shown before any action that the permission manager
/// classified as needing confirmation. Denying is always available and is the
/// default action when the dialog is closed.
/// </summary>
public sealed class ApprovalDialog : Window
{
    public ApprovalDialog(ApprovalRequest request, Localization localization)
    {
        ArgumentNullException.ThrowIfNull(request);

        Title = localization.T("pc.approval.title");
        Width = 520;
        Height = 420;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        FlowDirection = localization.IsRightToLeft ? FlowDirection.RightToLeft : FlowDirection.LeftToRight;

        var panel = new DockPanel { Margin = new Thickness(16) };

        var buttons = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
        };

        var approve = new Button { Content = localization.T("pc.approval.approve") };
        var approveSession = new Button { Content = localization.T("pc.approval.alwaysAllow") };
        var deny = new Button { Content = localization.T("pc.approval.deny") };

        approve.Click += (_, _) =>
        {
            Outcome = ApprovalOutcome.ApprovedOnce;
            DialogResult = true;
        };

        approveSession.Click += (_, _) =>
        {
            Outcome = ApprovalOutcome.ApprovedForSession;
            DialogResult = true;
        };

        deny.Click += (_, _) =>
        {
            Outcome = ApprovalOutcome.Denied;
            DialogResult = false;
        };

        buttons.Children.Add(approve);
        buttons.Children.Add(approveSession);
        buttons.Children.Add(deny);

        DockPanel.SetDock(buttons, Dock.Bottom);
        panel.Children.Add(buttons);

        var content = new StackPanel();
        content.Children.Add(new TextBlock
        {
            Text = request.Summary,
            FontWeight = FontWeights.SemiBold,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 0, 0, 8),
        });

        content.Children.Add(new TextBlock
        {
            Text = $"Tool: {request.Tool.Name}",
            TextWrapping = TextWrapping.Wrap,
        });

        content.Children.Add(new TextBlock
        {
            Text = $"Risk: {request.Tool.Risk} · Reason: {request.Decision.Reason}",
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 0, 0, 8),
        });

        content.Children.Add(new TextBlock
        {
            Text = "Arguments",
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 8, 0, 4),
        });

        content.Children.Add(new TextBox
        {
            Text = Truncate(request.ArgumentsJson, 4000),
            IsReadOnly = true,
            AcceptsReturn = true,
            TextWrapping = TextWrapping.Wrap,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            Height = 180,
        });

        panel.Children.Add(content);
        Content = panel;
    }

    /// <summary>Outcome chosen by the user. Defaults to denial.</summary>
    public ApprovalOutcome Outcome { get; private set; } = ApprovalOutcome.Denied;

    private static string Truncate(string value, int max) =>
        string.IsNullOrEmpty(value) || value.Length <= max ? value : value[..max];
}
