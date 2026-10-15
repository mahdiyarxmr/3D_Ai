using System.Text.Json;
using LunaAI.PC.Agent;
using LunaAI.PC.Computer.Services;
using LunaAI.PC.Core.Ai;
using LunaAI.PC.Core.Models;
using LunaAI.PC.Security.Permissions;

namespace LunaAI.PC.Tests;

/// <summary>Approval prompt that always denies. Used to prove denied actions never execute.</summary>
public sealed class DenyingApprovalPrompt : IApprovalPrompt
{
    public int Requests { get; private set; }

    public bool IsAutoApproving => false;

    public Task<ApprovalOutcome> RequestApprovalAsync(ApprovalRequest request, CancellationToken cancellationToken)
    {
        Requests++;
        return Task.FromResult(ApprovalOutcome.Denied);
    }
}

public sealed class ApprovingApprovalPrompt : IApprovalPrompt
{
    public ApprovingApprovalPrompt(ApprovalOutcome outcome = ApprovalOutcome.ApprovedOnce) => Outcome = outcome;

    public ApprovalOutcome Outcome { get; }

    public int Requests { get; private set; }

    public bool IsAutoApproving => false;

    public Task<ApprovalOutcome> RequestApprovalAsync(ApprovalRequest request, CancellationToken cancellationToken)
    {
        Requests++;
        return Task.FromResult(Outcome);
    }
}

/// <summary>Records whether it was invoked; used to prove denied tools are never run.</summary>
public sealed class RecordingTool : ITool
{
    public RecordingTool(ToolDescriptor descriptor) => Descriptor = descriptor;

    public ToolDescriptor Descriptor { get; }

    public string ParametersJsonSchema { get; } = "{\"type\": \"object\", \"properties\": {}}";

    public int Invocations { get; private set; }

    public Task<ToolResult> InvokeAsync(ToolInvocationContext context, JsonElement arguments, CancellationToken cancellationToken)
    {
        Invocations++;
        return Task.FromResult(ToolResult.Ok("executed"));
    }
}

public sealed class FakeScreenService : IScreenService
{
    public bool IsSupported => true;

    public Task<ScreenshotResult> CaptureAsync(CancellationToken cancellationToken) =>
        Task.FromResult(new ScreenshotResult(new byte[] { 1, 2, 3 }, 10, 20, DateTimeOffset.Now, "Test"));
}

public sealed class FakeInputService : IInputService
{
    public bool IsSupported => true;

    public List<string> Actions { get; } = new();

    public Task MoveMouseAsync(int x, int y, CancellationToken cancellationToken)
    {
        Actions.Add($"move:{x},{y}");
        return Task.CompletedTask;
    }

    public Task ClickAsync(MouseButton button, CancellationToken cancellationToken)
    {
        Actions.Add($"click:{button}");
        return Task.CompletedTask;
    }

    public Task TypeTextAsync(string text, CancellationToken cancellationToken)
    {
        Actions.Add($"type:{text}");
        return Task.CompletedTask;
    }

    public Task PressKeyAsync(string key, CancellationToken cancellationToken)
    {
        Actions.Add($"key:{key}");
        return Task.CompletedTask;
    }

    public Task ScrollAsync(int delta, CancellationToken cancellationToken)
    {
        Actions.Add($"scroll:{delta}");
        return Task.CompletedTask;
    }
}

public sealed class FakeApplicationService : IApplicationService
{
    public bool IsSupported => true;

    public Task<int> LaunchAsync(string pathOrName, string arguments, CancellationToken cancellationToken) => Task.FromResult(4242);

    public IReadOnlyList<WindowInfo> ListWindows() => new[] { new WindowInfo("Test window", "test", 1) };

    public Task<bool> FocusWindowAsync(nint handle, CancellationToken cancellationToken) => Task.FromResult(true);
}

/// <summary>Provider that replays a fixed script: text and tool calls.</summary>
public sealed class ScriptedProvider : IChatProvider
{
    private readonly Queue<ChatDelta> _script;

    public ScriptedProvider(IEnumerable<ChatDelta> script) => _script = new Queue<ChatDelta>(script);

    public string Id => "scripted";

    public string DisplayName => "Scripted provider";

    public bool IsDevelopmentProvider => true;

    public int Calls { get; private set; }

    public async IAsyncEnumerable<ChatDelta> StreamAsync(
        ChatRequest request,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        Calls++;
        while (_script.Count > 0)
        {
            cancellationToken.ThrowIfCancellationRequested();
            await Task.Yield();
            yield return _script.Dequeue();
        }
    }
}
