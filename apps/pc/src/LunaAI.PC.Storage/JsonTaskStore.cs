using LunaAI.PC.Core.Models;

namespace LunaAI.PC.Storage;

public interface ITaskStore
{
    IReadOnlyList<TaskPlan> List();

    void Save(TaskPlan plan);
}

public sealed class JsonTaskStore : ITaskStore
{
    private readonly object _gate = new();
    private readonly string _path;
    private readonly List<TaskPlan> _plans;

    public JsonTaskStore(string? path = null)
    {
        _path = path ?? AppPaths.TasksFile;
        _plans = JsonDocumentStore.Read(_path, () => new List<TaskPlan>());
    }

    public string FilePath => _path;

    public IReadOnlyList<TaskPlan> List()
    {
        lock (_gate)
        {
            return _plans.OrderByDescending(plan => plan.CreatedAt).ToList();
        }
    }

    public void Save(TaskPlan plan)
    {
        ArgumentNullException.ThrowIfNull(plan);

        lock (_gate)
        {
            var index = _plans.FindIndex(existing => existing.Id == plan.Id);
            if (index >= 0)
            {
                _plans[index] = plan;
            }
            else
            {
                _plans.Add(plan);
            }

            JsonDocumentStore.Write(_path, _plans);
        }
    }
}
