namespace LunaAI.PC.Security.Permissions;

/// <summary>
/// Global emergency stop. While engaged, no computer action may run, at any
/// permission level and for any tool — including tools that would otherwise be
/// allowed without a prompt.
/// </summary>
public sealed class EmergencyStop
{
    private readonly object _gate = new();
    private bool _engaged;
    private string _reason = string.Empty;

    public event EventHandler<string>? Engaged;

    public bool IsEngaged
    {
        get
        {
            lock (_gate)
            {
                return _engaged;
            }
        }
    }

    public string Reason
    {
        get
        {
            lock (_gate)
            {
                return _reason;
            }
        }
    }

    public void Engage(string reason = "user_requested")
    {
        lock (_gate)
        {
            _engaged = true;
            _reason = reason;
        }

        Engaged?.Invoke(this, reason);
    }

    public void Disengage()
    {
        lock (_gate)
        {
            _engaged = false;
            _reason = string.Empty;
        }
    }
}
