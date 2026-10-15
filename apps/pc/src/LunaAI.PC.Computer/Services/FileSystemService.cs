namespace LunaAI.PC.Computer.Services;

/// <summary>
/// File access implementation. This class performs raw I/O only: every path must
/// already have been authorised by the permission manager's path guard before it
/// is handed to this service.
/// </summary>
public sealed class FileSystemService : IFileSystemService
{
    public IReadOnlyList<string> ListDirectory(string path)
    {
        var entries = new List<string>();

        foreach (var directory in Directory.EnumerateDirectories(path))
        {
            entries.Add(directory);
        }

        foreach (var file in Directory.EnumerateFiles(path))
        {
            entries.Add(file);
        }

        return entries;
    }

    public string ReadTextFile(string path, int maxBytes)
    {
        if (maxBytes <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(maxBytes));
        }

        var info = new FileInfo(path);
        if (!info.Exists)
        {
            throw new FileNotFoundException("File not found.", path);
        }

        if (info.Length > maxBytes)
        {
            throw new InvalidOperationException($"file_too_large:{info.Length}>{maxBytes}");
        }

        return File.ReadAllText(path);
    }

    public void WriteTextFile(string path, string content)
    {
        var directory = Path.GetDirectoryName(Path.GetFullPath(path));
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        File.WriteAllText(path, content ?? string.Empty);
    }

    public void CreateDirectory(string path) => Directory.CreateDirectory(path);

    public void MovePath(string source, string destination)
    {
        if (Directory.Exists(source))
        {
            Directory.Move(source, destination);
            return;
        }

        File.Move(source, destination, overwrite: false);
    }

    public void DeletePath(string path, bool recursive)
    {
        if (Directory.Exists(path))
        {
            Directory.Delete(path, recursive);
            return;
        }

        File.Delete(path);
    }
}
