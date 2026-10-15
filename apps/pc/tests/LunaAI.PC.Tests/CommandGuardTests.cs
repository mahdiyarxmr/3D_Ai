using LunaAI.PC.Security.Permissions;
using Xunit;

namespace LunaAI.PC.Tests;

public sealed class CommandGuardTests
{
    private readonly CommandGuard _guard = new();

    [Theory]
    [InlineData("dotnet", "build LunaAI.PC.sln")]
    [InlineData("git", "status")]
    [InlineData("node", "--version")]
    public void Allows_allow_listed_executables_with_safe_arguments(string executable, string arguments)
    {
        var validation = _guard.Validate(executable, arguments);
        Assert.True(validation.IsAllowed, validation.Reason);
    }

    [Theory]
    [InlineData("cmd")]
    [InlineData("powershell")]
    [InlineData("pwsh")]
    [InlineData("bash")]
    [InlineData("sh")]
    [InlineData("wscript")]
    [InlineData("reg")]
    [InlineData("net")]
    public void Rejects_shells_and_system_administration_tools(string executable)
    {
        var validation = _guard.Validate(executable, "-c anything");
        Assert.False(validation.IsAllowed);
        Assert.Equal("executable_not_allowed", validation.Reason);
    }

    [Theory]
    [InlineData("rm -rf /")]
    [InlineData("format c:")]
    [InlineData("del /f /s /q C:\\")]
    [InlineData("shutdown /s /t 0")]
    [InlineData("bcdedit /set")]
    [InlineData("reg delete HKLM\\Software")]
    public void Rejects_destructive_argument_patterns(string arguments)
    {
        var validation = _guard.Validate("dotnet", arguments);
        Assert.False(validation.IsAllowed);
        Assert.Equal("destructive_command_blocked", validation.Reason);
    }

    [Theory]
    [InlineData("build && rm -rf .")]
    [InlineData("build | tee out.txt")]
    [InlineData("`whoami`")]
    [InlineData("$(cat /etc/passwd)")]
    [InlineData("build > file.txt")]
    [InlineData("build; echo done")]
    public void Rejects_shell_metacharacters(string arguments)
    {
        var validation = _guard.Validate("npm", arguments);
        Assert.False(validation.IsAllowed);
        Assert.Equal("shell_metacharacter_blocked", validation.Reason);
    }

    [Fact]
    public void Rejects_executables_given_by_path()
    {
        var validation = _guard.Validate(@"C:\Windows\System32\cmd.exe", "/c dir");
        Assert.False(validation.IsAllowed);
        Assert.Equal("executable_must_be_on_allow_list", validation.Reason);
    }

    [Fact]
    public void Rejects_null_bytes_in_arguments()
    {
        var validation = _guard.Validate("node", "script.js\0--evil");
        Assert.False(validation.IsAllowed);
    }
}
