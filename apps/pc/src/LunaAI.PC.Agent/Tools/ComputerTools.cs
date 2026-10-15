using System.Text.Json;
using System.Text.Json.Serialization;
using LunaAI.PC.Computer.Services;
using LunaAI.PC.Storage;
using LunaAI.PC.Security.Permissions;

namespace LunaAI.PC.Agent.Tools;

/// <summary>
/// Captures the screen and records it locally.
///
/// The image is written to the LunaAI data directory so the agent can refer to
/// it later. Screenshot pixels are never uploaded to a provider by this tool;
/// sharing images with a remote model would need the user to enable the
/// "send screenshots to the provider" privacy setting (a planned feature that is
/// not enabled by this tool today).
/// </summary>
public sealed class ScreenCaptureTool : ITool
{
    private readonly IScreenService _screen;
    private readonly string _outputDirectory;

    public ScreenCaptureTool(IScreenService screen, string? outputDirectory = null)
    {
        _screen = screen;
        _outputDirectory = outputDirectory ?? Path.Combine(AppPaths.DataDirectory, "screenshots");
    }

    public ToolDescriptor Descriptor { get; } = new(
        "capture_screen",
        "Take a screenshot of the desktop for visual understanding.",
        RiskLevel.Medium,
        PermissionLevel.Observe,
        ToolCapability.ReadScreen);

    public string ParametersJsonSchema { get; } = "{\"type\": \"object\", \"properties\": {}, \"additionalProperties\": false}";

    public async Task<ToolResult> InvokeAsync(ToolInvocationContext context, JsonElement arguments, CancellationToken cancellationToken)
    {
        if (!_screen.IsSupported)
        {
            return ToolResult.Fail("screen_capture_requires_windows");
        }

        var screenshot = await _screen.CaptureAsync(cancellationToken).ConfigureAwait(false);
        Directory.CreateDirectory(_outputDirectory);

        var fileName = $"screenshot-{screenshot.TakenAt:yyyyMMdd-HHmmss}.png";
        var path = Path.Combine(_outputDirectory, fileName);
        await File.WriteAllBytesAsync(path, screenshot.PngBytes, cancellationToken).ConfigureAwait(false);

        var summary = new ScreenshotSummary(
            path,
            screenshot.Width,
            screenshot.Height,
            screenshot.TakenAt,
            screenshot.ActiveWindowTitle,
            screenshot.PngBytes.Length);

        return ToolResult.Ok(JsonSerializer.Serialize(summary));
    }

    private sealed record ScreenshotSummary(
        string Path,
        int Width,
        int Height,
        DateTimeOffset TakenAt,
        string ActiveWindowTitle,
        [property: JsonPropertyName("bytes")] int ByteCount);
}

public sealed class MouseClickTool : ITool
{
    private readonly IInputService _input;

    public MouseClickTool(IInputService input) => _input = input;

    public ToolDescriptor Descriptor { get; } = new(
        "mouse_click",
        "Move the mouse to a screen position and click a button.",
        RiskLevel.High,
        PermissionLevel.Assist,
        ToolCapability.ControlInput);

    public string ParametersJsonSchema { get; } = ToolJson.Schema(
        "\"x\": {\"type\": \"integer\", \"description\": \"Horizontal screen coordinate.\"}"
        + ", \"y\": {\"type\": \"integer\", \"description\": \"Vertical screen coordinate.\"}"
        + ", \"button\": {\"type\": \"string\", \"enum\": [\"left\", \"right\", \"middle\"], \"description\": \"Mouse button.\"}",
        "\"x\", \"y\"");

    public async Task<ToolResult> InvokeAsync(ToolInvocationContext context, JsonElement arguments, CancellationToken cancellationToken)
    {
        if (!_input.IsSupported)
        {
            return ToolResult.Fail("input_control_requires_windows");
        }

        var x = ToolJson.OptionalInt(arguments, "x", int.MinValue);
        var y = ToolJson.OptionalInt(arguments, "y", int.MinValue);
        if (x == int.MinValue || y == int.MinValue)
        {
            return ToolResult.Fail("argument_required:x,y");
        }

        var button = ToolJson.OptionalString(arguments, "button") switch
        {
            "right" => MouseButton.Right,
            "middle" => MouseButton.Middle,
            _ => MouseButton.Left,
        };

        await _input.MoveMouseAsync(x, y, cancellationToken).ConfigureAwait(false);
        await _input.ClickAsync(button, cancellationToken).ConfigureAwait(false);
        return ToolResult.Ok($"clicked {button} at {x},{y}");
    }
}

public sealed class TypeTextTool : ITool
{
    private readonly IInputService _input;

    public TypeTextTool(IInputService input) => _input = input;

    public ToolDescriptor Descriptor { get; } = new(
        "type_text",
        "Type text into the currently focused window using synthetic keyboard input.",
        RiskLevel.High,
        PermissionLevel.Assist,
        ToolCapability.ControlInput);

    public string ParametersJsonSchema { get; } = ToolJson.Schema(
        "\"text\": " + ToolJson.StringProperty("Text to type."),
        "\"text\"");

    public async Task<ToolResult> InvokeAsync(ToolInvocationContext context, JsonElement arguments, CancellationToken cancellationToken)
    {
        if (!_input.IsSupported)
        {
            return ToolResult.Fail("input_control_requires_windows");
        }

        var text = ToolJson.RequiredString(arguments, "text");
        if (text.Length > 2000)
        {
            return ToolResult.Fail("text_too_long");
        }

        await _input.TypeTextAsync(text, cancellationToken).ConfigureAwait(false);
        return ToolResult.Ok($"typed {text.Length} characters");
    }
}

public sealed class PressKeyTool : ITool
{
    private readonly IInputService _input;

    public PressKeyTool(IInputService input) => _input = input;

    public ToolDescriptor Descriptor { get; } = new(
        "press_key",
        "Press a single key such as ENTER, TAB, ESCAPE or VK_RETURN.",
        RiskLevel.Medium,
        PermissionLevel.Assist,
        ToolCapability.ControlInput);

    public string ParametersJsonSchema { get; } = ToolJson.Schema(
        "\"key\": " + ToolJson.StringProperty("Key name, for example ENTER or VK_ESCAPE."),
        "\"key\"");

    public async Task<ToolResult> InvokeAsync(ToolInvocationContext context, JsonElement arguments, CancellationToken cancellationToken)
    {
        if (!_input.IsSupported)
        {
            return ToolResult.Fail("input_control_requires_windows");
        }

        var key = ToolJson.RequiredString(arguments, "key");
        await _input.PressKeyAsync(key, cancellationToken).ConfigureAwait(false);
        return ToolResult.Ok($"pressed {key}");
    }
}

public sealed class ListWindowsTool : ITool
{
    private readonly IApplicationService _applications;

    public ListWindowsTool(IApplicationService applications) => _applications = applications;

    public ToolDescriptor Descriptor { get; } = new(
        "list_windows",
        "List the visible top-level windows and their process names.",
        RiskLevel.Low,
        PermissionLevel.Observe,
        ToolCapability.ControlWindows);

    public string ParametersJsonSchema { get; } = "{\"type\": \"object\", \"properties\": {}, \"additionalProperties\": false}";

    public Task<ToolResult> InvokeAsync(ToolInvocationContext context, JsonElement arguments, CancellationToken cancellationToken)
    {
        if (!_applications.IsSupported)
        {
            return Task.FromResult(ToolResult.Fail("window_control_requires_windows"));
        }

        var windows = _applications.ListWindows();
        var lines = windows.Select(window => $"{window.ProcessName}: {window.Title}");
        return Task.FromResult(ToolResult.Ok(string.Join(Environment.NewLine, lines.Take(200))));
    }
}

public sealed class LaunchApplicationTool : ITool
{
    private readonly IApplicationService _applications;

    public LaunchApplicationTool(IApplicationService applications) => _applications = applications;

    public ToolDescriptor Descriptor { get; } = new(
        "launch_application",
        "Launch an installed application by executable name or path.",
        RiskLevel.High,
        PermissionLevel.Assist,
        ToolCapability.LaunchApplications);

    public string ParametersJsonSchema { get; } = ToolJson.Schema(
        "\"application\": " + ToolJson.StringProperty("Executable name or absolute path.")
        + ", \"arguments\": " + ToolJson.StringProperty("Optional command-line arguments."),
        "\"application\"");

    public async Task<ToolResult> InvokeAsync(ToolInvocationContext context, JsonElement arguments, CancellationToken cancellationToken)
    {
        if (!_applications.IsSupported)
        {
            return ToolResult.Fail("application_launch_requires_windows");
        }

        var application = ToolJson.RequiredString(arguments, "application");
        if (application.Contains('|') || application.Contains('&') || application.Contains(';'))
        {
            return ToolResult.Fail("invalid_application_name");
        }

        var argumentText = ToolJson.OptionalString(arguments, "arguments") ?? string.Empty;
        var processId = await _applications.LaunchAsync(application, argumentText, cancellationToken).ConfigureAwait(false);
        return ToolResult.Ok($"launched {application} (pid {processId})");
    }
}

public sealed class RunCommandTool : ITool
{
    private readonly IProcessService _processes;

    public RunCommandTool(IProcessService processes) => _processes = processes;

    public ToolDescriptor Descriptor { get; } = new(
        "run_command",
        "Run an allow-listed developer command without a shell and return its output.",
        RiskLevel.High,
        PermissionLevel.Assist,
        ToolCapability.ExecuteCommands,
        RequiresCommandExecution: true);

    public string ParametersJsonSchema { get; } = ToolJson.Schema(
        "\"executable\": " + ToolJson.StringProperty("Allow-listed executable, for example dotnet or node.")
        + ", \"arguments\": " + ToolJson.StringProperty("Command-line arguments.")
        + ", \"working_directory\": " + ToolJson.StringProperty("Optional working directory inside an approved location."),
        "\"executable\"");

    public async Task<ToolResult> InvokeAsync(ToolInvocationContext context, JsonElement arguments, CancellationToken cancellationToken)
    {
        var executable = ToolJson.RequiredString(arguments, "executable");
        var argumentText = ToolJson.OptionalString(arguments, "arguments") ?? string.Empty;
        var workingDirectory = ToolJson.OptionalString(arguments, "working_directory");

        var result = await _processes
            .RunAsync(executable, argumentText, workingDirectory, TimeSpan.FromSeconds(120), cancellationToken)
            .ConfigureAwait(false);

        var output = string.Join(
            Environment.NewLine,
            $"exit_code: {result.ExitCode}",
            result.StandardOutput,
            result.StandardError).Trim();

        return result.Succeeded ? ToolResult.Ok(output) : ToolResult.Fail(output);
    }
}
