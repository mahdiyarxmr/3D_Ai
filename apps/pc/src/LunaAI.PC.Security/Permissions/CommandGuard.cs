namespace LunaAI.PC.Security.Permissions;

public sealed record CommandValidation(bool IsAllowed, string Reason, string Executable);

/// <summary>
/// Validates command execution requests before they reach the operating system.
///
/// Commands are executed without a shell (no cmd.exe / sh interpolation), the
/// executable must come from an explicit allow list and arguments containing
/// shell metacharacters, destructive patterns or protected-path writes are
/// rejected outright.
/// </summary>
public sealed class CommandGuard
{
    public static readonly string[] DefaultAllowedExecutables = new[]
    {
        "dotnet", "node", "npm", "npx", "pnpm", "yarn", "python", "python3", "pip", "pytest",
        "git", "cargo", "rustc", "go", "javac", "java", "mvn", "gradle", "make", "cmake",
        "msbuild", "tsc", "eslint", "prettier", "jq",
    };

    private static readonly string[] ShellMetacharacters = new[]
    {
        "|", "&&", "||", ";", "`", "$(", "${", ">", "<", "\n", "\r", "&",
    };

    private static readonly string[] DestructivePatterns = new[]
    {
        "format ", "diskpart", "shutdown", "rd /s", "rmdir /s", "del /f", "del /s", "del /q",
        "rm -rf /", "rm -rf /*", "mkfs", "dd if=", "reg delete", "bcdedit", "vssadmin",
        "takeown", "icacls", "net user", "cipher /w", "remove-item -recurse -force c:\\",
        "attrib -r -s -h", "chmod -R 777 /", ":(){", "taskkill /f /im",
    };

    private readonly HashSet<string> _allowedExecutables;

    public CommandGuard(IEnumerable<string>? allowedExecutables = null)
    {
        _allowedExecutables = new HashSet<string>(
            allowedExecutables ?? DefaultAllowedExecutables,
            StringComparer.OrdinalIgnoreCase);
    }

    public IReadOnlyCollection<string> AllowedExecutables => _allowedExecutables;

    public CommandValidation Validate(string executable, string arguments)
    {
        if (string.IsNullOrWhiteSpace(executable))
        {
            return new CommandValidation(false, "executable_required", string.Empty);
        }

        var name = executable.Trim();
        arguments ??= string.Empty;

        if (name.Contains('/') || name.Contains('\\'))
        {
            return new CommandValidation(false, "executable_must_be_on_allow_list", name);
        }

        var bareName = name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? name[..^4] : name;
        if (!_allowedExecutables.Contains(bareName))
        {
            return new CommandValidation(false, "executable_not_allowed", name);
        }

        var loweredArguments = arguments.ToLowerInvariant();
        foreach (var pattern in DestructivePatterns)
        {
            if (loweredArguments.Contains(pattern, StringComparison.Ordinal))
            {
                return new CommandValidation(false, "destructive_command_blocked", name);
            }
        }

        foreach (var metacharacter in ShellMetacharacters)
        {
            if (loweredArguments.Contains(metacharacter, StringComparison.Ordinal))
            {
                return new CommandValidation(false, "shell_metacharacter_blocked", name);
            }
        }

        if (arguments.Contains('\0'))
        {
            return new CommandValidation(false, "invalid_arguments", name);
        }

        return new CommandValidation(true, "allowed", name);
    }
}
