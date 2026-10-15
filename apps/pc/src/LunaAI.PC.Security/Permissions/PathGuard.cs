namespace LunaAI.PC.Security.Permissions;

public sealed record PathValidation(bool IsAllowed, string Reason, string ResolvedPath)
{
    public static PathValidation Allow(string resolved) => new(true, "allowed", resolved);

    public static PathValidation Deny(string reason, string resolved) => new(false, reason, resolved);
}

/// <summary>
/// Restricts every file operation to locations the user explicitly authorised.
///
/// Protections:
///  * paths are canonicalised before comparison (defeats ".." traversal),
///  * symbolic links and junctions are resolved and re-checked, so they cannot
///    escape an approved root,
///  * operating-system directories stay off limits even if an approved root
///    contains them (for example when the user approves an entire drive).
/// </summary>
public sealed class PathGuard
{
    private readonly List<string> _approvedRoots;
    private readonly bool _caseSensitive;

    public PathGuard(IEnumerable<string> approvedRoots, bool? caseSensitive = null)
    {
        _approvedRoots = approvedRoots?
            .Where(root => !string.IsNullOrWhiteSpace(root))
            .Select(Normalize)
            .Distinct(ComparerFor(caseSensitive ?? !OperatingSystem.IsWindows()))
            .ToList() ?? new List<string>();

        _caseSensitive = caseSensitive ?? !OperatingSystem.IsWindows();
    }

    public IReadOnlyList<string> ApprovedRoots => _approvedRoots;

    private static StringComparer ComparerFor(bool caseSensitive) =>
        caseSensitive ? StringComparer.Ordinal : StringComparer.OrdinalIgnoreCase;

    private static readonly string[] ProtectedDirectoryNames = new[]
    {
        "windows", "system32", "syswow64", "program files", "program files (x86)", "programdata",
        "etc", "bin", "sbin", "usr", "boot", "dev", "proc", "sys",
    };

    public PathValidation Validate(string path, PathAccess access)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return PathValidation.Deny("path_empty", string.Empty);
        }

        string absolute;
        try
        {
            absolute = Normalize(path);
        }
        catch (Exception exception) when (exception is ArgumentException or NotSupportedException or PathTooLongException)
        {
            return PathValidation.Deny("path_invalid", string.Empty);
        }

        if (ContainsTraversal(path))
        {
            return PathValidation.Deny("path_traversal", absolute);
        }

        var resolved = ResolveExistingLinks(absolute);
        if (resolved is null)
        {
            return PathValidation.Deny("path_unresolvable", absolute);
        }

        if (IsProtectedDirectory(resolved))
        {
            return PathValidation.Deny("protected_directory", resolved);
        }

        if (!IsInsideApprovedRoot(resolved))
        {
            return PathValidation.Deny("outside_approved_roots", resolved);
        }

        // A write always needs a second look at the parent chain so a symlinked
        // parent directory cannot smuggle the operation outside the root.
        if (access == PathAccess.Write && !IsInsideApprovedRoot(ResolveExistingLinks(GetExistingAncestor(resolved)) ?? resolved))
        {
            return PathValidation.Deny("outside_approved_roots", resolved);
        }

        return PathValidation.Allow(resolved);
    }

    public bool IsInsideApprovedRoot(string path)
    {
        var candidate = Normalize(path);
        foreach (var root in _approvedRoots)
        {
            var withSeparator = root.EndsWith(Path.DirectorySeparatorChar)
                ? root
                : root + Path.DirectorySeparatorChar;

            if (ComparerFor(_caseSensitive).Equals(candidate, root))
            {
                return true;
            }

            if (candidate.StartsWith(withSeparator, _caseSensitive ? StringComparison.Ordinal : StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static string Normalize(string path)
    {
        var expanded = Environment.ExpandEnvironmentVariables(path.Trim().Trim('"'));
        return Path.GetFullPath(expanded).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
    }

    private static bool ContainsTraversal(string path)
    {
        var parts = path.Replace('\\', '/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        var depth = 0;
        foreach (var part in parts)
        {
            if (part == "..")
            {
                if (depth == 0)
                {
                    return true;
                }

                depth--;
            }
            else if (part != ".")
            {
                depth++;
            }
        }

        return false;
    }

    /// <summary>
    /// Walks the path from the root downwards and resolves symbolic links or
    /// junctions at every level, so a link *inside* an approved root cannot point
    /// to a location outside it.
    /// </summary>
    private static string? ResolveExistingLinks(string path)
    {
        try
        {
            var full = Path.GetFullPath(path);
            var root = Path.GetPathRoot(full);
            if (string.IsNullOrEmpty(root))
            {
                return full;
            }

            var current = root;
            var relative = full[root.Length..];
            foreach (var segment in relative.Split(new[] { '\\', '/' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var next = Path.Combine(current, segment);

                var directory = new DirectoryInfo(next);
                if (directory.Exists)
                {
                    var target = directory.LinkTarget is not null ? directory.ResolveLinkTarget(returnFinalTarget: true) : null;
                    current = target?.FullName ?? directory.FullName;
                    continue;
                }

                var file = new FileInfo(next);
                if (file.Exists)
                {
                    var target = file.LinkTarget is not null ? file.ResolveLinkTarget(returnFinalTarget: true) : null;
                    current = target?.FullName ?? file.FullName;
                    continue;
                }

                // Component does not exist yet (a write target): keep the literal path.
                current = next;
            }

            return current;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or NotSupportedException or ArgumentException)
        {
            return null;
        }
    }

    private static string GetExistingAncestor(string path)
    {
        var current = path;
        while (!string.IsNullOrEmpty(current))
        {
            if (Directory.Exists(current) || File.Exists(current))
            {
                return current;
            }

            var parent = Path.GetDirectoryName(current);
            if (string.IsNullOrEmpty(parent) || parent == current)
            {
                break;
            }

            current = parent;
        }

        return path;
    }

    private bool IsProtectedDirectory(string path)
    {
        var root = Path.GetPathRoot(path);
        if (string.IsNullOrEmpty(root))
        {
            return false;
        }

        var relative = path[root.Length..];
        var segments = relative.Split(new[] { '\\', '/' }, StringSplitOptions.RemoveEmptyEntries);

        // Treat the first two levels as protected when they name an OS directory.
        for (var index = 0; index < segments.Length && index < 2; index++)
        {
            var segment = segments[index].ToLowerInvariant();
            if (ProtectedDirectoryNames.Contains(segment))
            {
                return true;
            }
        }

        return false;
    }
}
