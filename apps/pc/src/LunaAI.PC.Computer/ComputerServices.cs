using LunaAI.PC.Computer.Services;
using LunaAI.PC.Computer.Windows;

namespace LunaAI.PC.Computer;

/// <summary>
/// Aggregates the computer capabilities available on this machine.
/// On non-Windows systems the screen, input and application services report
/// themselves as unsupported instead of silently doing nothing.
/// </summary>
public sealed class ComputerServices
{
    public ComputerServices(
        IScreenService screen,
        IInputService input,
        IFileSystemService files,
        IProcessService processes,
        IApplicationService applications)
    {
        Screen = screen;
        Input = input;
        Files = files;
        Processes = processes;
        Applications = applications;
    }

    public IScreenService Screen { get; }

    public IInputService Input { get; }

    public IFileSystemService Files { get; }

    public IProcessService Processes { get; }

    public IApplicationService Applications { get; }

    public static ComputerServices CreateForCurrentPlatform() => new(
        OperatingSystem.IsWindows() ? new WindowsScreenService() : new UnsupportedScreenService(),
        OperatingSystem.IsWindows() ? new WindowsInputService() : new UnsupportedInputService(),
        new FileSystemService(),
        new ProcessService(),
        OperatingSystem.IsWindows() ? new WindowsApplicationService() : new UnsupportedApplicationService());
}
