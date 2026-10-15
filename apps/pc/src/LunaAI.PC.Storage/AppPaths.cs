namespace LunaAI.PC.Storage;

/// <summary>
/// Local data locations. Everything LunaAI PC stores lives in a per-user
/// application data directory; the environment variable
/// <c>LUNAAI_PC_DATA_DIR</c> overrides it (used by tests and portable installs).
/// </summary>
public static class AppPaths
{
    public const string DataDirectoryEnvironmentVariable = "LUNAAI_PC_DATA_DIR";

    public const string ApplicationFolderName = "LunaAI";

    public static string DataDirectory
    {
        get
        {
            var overridden = Environment.GetEnvironmentVariable(DataDirectoryEnvironmentVariable);
            if (!string.IsNullOrWhiteSpace(overridden))
            {
                return Path.GetFullPath(overridden);
            }

            var root = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            if (string.IsNullOrWhiteSpace(root))
            {
                root = Path.Combine(Path.GetTempPath(), "LunaAI");
            }

            return Path.Combine(root, ApplicationFolderName);
        }
    }

    public static string SettingsFile => Path.Combine(DataDirectory, "settings.json");

    public static string ConversationsFile => Path.Combine(DataDirectory, "conversations.json");

    public static string TasksFile => Path.Combine(DataDirectory, "tasks.json");

    public static string AuditLogFile => Path.Combine(DataDirectory, "audit", "lunaai-pc-audit.jsonl");

    public static string LogFile => Path.Combine(DataDirectory, "logs", "lunaai-pc.log");

    public static void EnsureDirectories()
    {
        Directory.CreateDirectory(DataDirectory);
        Directory.CreateDirectory(Path.Combine(DataDirectory, "audit"));
        Directory.CreateDirectory(Path.Combine(DataDirectory, "logs"));
        Directory.CreateDirectory(Path.Combine(DataDirectory, "screenshots"));
    }
}
