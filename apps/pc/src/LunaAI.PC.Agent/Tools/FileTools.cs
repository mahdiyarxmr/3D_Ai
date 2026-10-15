using System.Text.Json;
using LunaAI.PC.Computer.Services;
using LunaAI.PC.Security.Permissions;

namespace LunaAI.PC.Agent.Tools;

/// <summary>Lists the contents of an approved directory. Read-only.</summary>
public sealed class ListDirectoryTool : ITool
{
    private readonly IFileSystemService _files;

    public ListDirectoryTool(IFileSystemService files) => _files = files;

    public ToolDescriptor Descriptor { get; } = new(
        "list_directory",
        "List files and folders inside an approved directory.",
        RiskLevel.Low,
        PermissionLevel.Observe,
        ToolCapability.ReadFiles,
        RequiresFileAccess: true);

    public string ParametersJsonSchema { get; } = ToolJson.Schema(
        "\"path\": " + ToolJson.StringProperty("Absolute directory path inside an approved location."),
        "\"path\"");

    public Task<ToolResult> InvokeAsync(ToolInvocationContext context, JsonElement arguments, CancellationToken cancellationToken)
    {
        var path = ToolJson.RequiredString(arguments, "path");
        var entries = _files.ListDirectory(path);
        return Task.FromResult(ToolResult.Ok(string.Join(Environment.NewLine, entries.Take(500))));
    }
}

/// <summary>Reads a text file inside an approved location. Read-only.</summary>
public sealed class ReadFileTool : ITool
{
    private readonly IFileSystemService _files;
    private readonly int _maxBytes;

    public ReadFileTool(IFileSystemService files, int maxBytes = 200_000)
    {
        _files = files;
        _maxBytes = maxBytes;
    }

    public ToolDescriptor Descriptor { get; } = new(
        "read_file",
        "Read the contents of a text file inside an approved location.",
        RiskLevel.Low,
        PermissionLevel.Observe,
        ToolCapability.ReadFiles,
        RequiresFileAccess: true);

    public string ParametersJsonSchema { get; } = ToolJson.Schema(
        "\"path\": " + ToolJson.StringProperty("Absolute file path inside an approved location.")
        + ", \"max_bytes\": {\"type\": \"integer\", \"description\": \"Maximum bytes to read.\"}",
        "\"path\"");

    public Task<ToolResult> InvokeAsync(ToolInvocationContext context, JsonElement arguments, CancellationToken cancellationToken)
    {
        var path = ToolJson.RequiredString(arguments, "path");
        var maxBytes = Math.Clamp(ToolJson.OptionalInt(arguments, "max_bytes", _maxBytes), 1, _maxBytes);
        var content = _files.ReadTextFile(path, maxBytes);
        return Task.FromResult(ToolResult.Ok(content));
    }
}

/// <summary>Writes a text file inside an approved location. Requires approval.</summary>
public sealed class WriteFileTool : ITool
{
    private readonly IFileSystemService _files;

    public WriteFileTool(IFileSystemService files) => _files = files;

    public ToolDescriptor Descriptor { get; } = new(
        "write_file",
        "Create or overwrite a text file inside an approved location.",
        RiskLevel.High,
        PermissionLevel.Assist,
        ToolCapability.WriteFiles,
        RequiresFileAccess: true);

    public string ParametersJsonSchema { get; } = ToolJson.Schema(
        "\"path\": " + ToolJson.StringProperty("Absolute file path inside an approved location.")
        + ", \"content\": " + ToolJson.StringProperty("Full file content to write."),
        "\"path\", \"content\"");

    public Task<ToolResult> InvokeAsync(ToolInvocationContext context, JsonElement arguments, CancellationToken cancellationToken)
    {
        var path = ToolJson.RequiredString(arguments, "path");
        var content = ToolJson.OptionalString(arguments, "content") ?? string.Empty;
        _files.WriteTextFile(path, content);
        return Task.FromResult(ToolResult.Ok($"wrote {content.Length} characters to {path}"));
    }
}

/// <summary>Moves or renames a path inside approved locations.</summary>
public sealed class MovePathTool : ITool
{
    private readonly IFileSystemService _files;

    public MovePathTool(IFileSystemService files) => _files = files;

    public ToolDescriptor Descriptor { get; } = new(
        "move_path",
        "Move or rename a file or directory between approved locations.",
        RiskLevel.Critical,
        PermissionLevel.Assist,
        ToolCapability.WriteFiles,
        RequiresFileAccess: true);

    public string ParametersJsonSchema { get; } = ToolJson.Schema(
        "\"source\": " + ToolJson.StringProperty("Existing path.")
        + ", \"destination\": " + ToolJson.StringProperty("New path."),
        "\"source\", \"destination\"");

    public Task<ToolResult> InvokeAsync(ToolInvocationContext context, JsonElement arguments, CancellationToken cancellationToken)
    {
        var source = ToolJson.RequiredString(arguments, "source");
        var destination = ToolJson.RequiredString(arguments, "destination");
        _files.MovePath(source, destination);
        return Task.FromResult(ToolResult.Ok($"moved {source} to {destination}"));
    }
}

/// <summary>Deletes a path inside an approved location. Always requires explicit approval.</summary>
public sealed class DeletePathTool : ITool
{
    private readonly IFileSystemService _files;

    public DeletePathTool(IFileSystemService files) => _files = files;

    public ToolDescriptor Descriptor { get; } = new(
        "delete_path",
        "Delete a file or directory inside an approved location.",
        RiskLevel.Critical,
        PermissionLevel.Assist,
        ToolCapability.WriteFiles,
        RequiresFileAccess: true);

    public string ParametersJsonSchema { get; } = ToolJson.Schema(
        "\"path\": " + ToolJson.StringProperty("Path to delete.")
        + ", \"recursive\": {\"type\": \"boolean\", \"description\": \"Delete a directory and its contents.\"}",
        "\"path\"");

    public Task<ToolResult> InvokeAsync(ToolInvocationContext context, JsonElement arguments, CancellationToken cancellationToken)
    {
        var path = ToolJson.RequiredString(arguments, "path");
        var recursive = ToolJson.OptionalBool(arguments, "recursive", false);
        _files.DeletePath(path, recursive);
        return Task.FromResult(ToolResult.Ok($"deleted {path}"));
    }
}
