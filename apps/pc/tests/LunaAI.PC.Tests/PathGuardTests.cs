using LunaAI.PC.Security.Permissions;
using Xunit;

namespace LunaAI.PC.Tests;

public sealed class PathGuardTests : IDisposable
{
    private readonly string _root;
    private readonly string _outside;
    private readonly PathGuard _guard;

    public PathGuardTests()
    {
        var baseDirectory = Path.Combine(Path.GetTempPath(), "lunaai-pathguard-" + Guid.NewGuid().ToString("n"));
        _root = Path.Combine(baseDirectory, "workspace");
        _outside = Path.Combine(baseDirectory, "outside");
        Directory.CreateDirectory(_root);
        Directory.CreateDirectory(_outside);
        File.WriteAllText(Path.Combine(_root, "inside.txt"), "hello");
        File.WriteAllText(Path.Combine(_outside, "secret.txt"), "secret");

        _guard = new PathGuard(new[] { _root });
    }

    [Fact]
    public void Allows_paths_inside_an_approved_root()
    {
        var validation = _guard.Validate(Path.Combine(_root, "inside.txt"), PathAccess.Read);

        Assert.True(validation.IsAllowed);
        Assert.Equal("allowed", validation.Reason);
    }

    [Fact]
    public void Denies_paths_outside_approved_roots()
    {
        var validation = _guard.Validate(Path.Combine(_outside, "secret.txt"), PathAccess.Read);

        Assert.False(validation.IsAllowed);
        Assert.Equal("outside_approved_roots", validation.Reason);
    }

    [Fact]
    public void Denies_traversal_attempts()
    {
        var traversal = Path.Combine(_root, "..", "outside", "secret.txt");
        var validation = _guard.Validate(traversal, PathAccess.Read);

        Assert.False(validation.IsAllowed);
        Assert.Contains(validation.Reason, new[] { "path_traversal", "outside_approved_roots" });
    }

    [Fact]
    public void Denies_operating_system_directories_even_inside_an_approved_root()
    {
        var guardForDriveRoot = new PathGuard(new[] { Path.GetPathRoot(_root)! });
        var systemPath = OperatingSystem.IsWindows() ? @"C:\Windows\System32\drivers\etc\hosts" : "/etc/hosts";

        var validation = guardForDriveRoot.Validate(systemPath, PathAccess.Read);

        Assert.False(validation.IsAllowed);
        Assert.Equal("protected_directory", validation.Reason);
    }

    [Fact]
    public void Denies_symbolic_links_that_escape_the_root()
    {
        var linkPath = Path.Combine(_root, "escape-link");
        try
        {
            Directory.CreateSymbolicLink(linkPath, _outside);
        }
        catch (Exception exception) when (exception is UnauthorizedAccessException or IOException or PlatformNotSupportedException)
        {
            // Symbolic link creation is not permitted in this environment.
            return;
        }

        var validation = _guard.Validate(Path.Combine(linkPath, "secret.txt"), PathAccess.Read);

        Assert.False(validation.IsAllowed);
        Assert.Equal("outside_approved_roots", validation.Reason);
    }

    [Fact]
    public void Denies_empty_and_invalid_paths()
    {
        Assert.False(_guard.Validate(string.Empty, PathAccess.Read).IsAllowed);
        Assert.False(_guard.Validate("   ", PathAccess.Read).IsAllowed);
    }

    public void Dispose()
    {
        try
        {
            var baseDirectory = Directory.GetParent(_root)!.FullName;
            Directory.Delete(baseDirectory, true);
        }
        catch (IOException)
        {
        }
    }
}
