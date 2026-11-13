using System.Collections.Concurrent;
using System.Text.Json.Nodes;
using OrbitdeckEdge.Hub.Audio;
using OrbitdeckEdge.Hub.Infrastructure;
using OrbitdeckEdge.Hub.Shortcuts;
using OrbitdeckEdge.Hub.SystemInfo;

namespace OrbitdeckEdge.Hub.Core;

/// <summary>A widget command failed; the code goes back to the widget as <c>error {code}</c>.</summary>
internal sealed class CommandException(string code) : Exception(code)
{
    public string Code { get; } = code;
}

/// <summary>Who sent a command: the connection (for per-widget state) and how to answer it.</summary>
internal sealed record Caller(Guid ConnectionId, string PairingId, Action<JsonObject> Reply);

/// <summary>What the server needs from the hub's features (lets tests use a fake).</summary>
internal interface IHubCore
{
    /// <summary>Everything a freshly paired widget needs.</summary>
    JsonObject Snapshot();
    /// <summary>A change every paired widget should get (raised on worker threads).</summary>
    event Action<JsonObject>? Broadcast;
    void Execute(JsonObject msg, Caller caller);
    void ConnectionClosed(Guid connectionId);
    byte[]? GetIcon(string id);
}

/// <summary>
/// Wires the features together and turns widget messages into calls. Every feature validates its own input;
/// this class only dispatches and keeps per-connection state (who wants visualizer frames).
/// </summary>
internal sealed class HubCore : IHubCore, IDisposable
{
    private readonly AudioService _audio;
    private readonly Visualizer _visualizer;
    private readonly SystemStats _system;
    private readonly ShortcutService _shortcuts;
    private readonly PowerActions _power;
    private readonly Sounds _sounds;
    private readonly BackupStore _backups;
    private readonly ConcurrentDictionary<Guid, byte> _wantVisualizer = new();

    public event Action<JsonObject>? Broadcast;
    private const string BackupId = "main";

    public bool AudioHealthy => _audio.Healthy;
    public event Action<bool>? AudioHealthChanged;

    public HubCore(AudioService audio, Visualizer visualizer, SystemStats system, ShortcutService shortcuts,
                   PowerActions power, Sounds sounds, BackupStore backups)
    {
        _audio = audio;
        _visualizer = visualizer;
        _system = system;
        _shortcuts = shortcuts;
        _power = power;
        _sounds = sounds;
        _backups = backups;
        _audio.Changed += data => Broadcast?.Invoke(new JsonObject { ["t"] = "audio", ["data"] = data });
        _audio.HealthChanged += h => AudioHealthChanged?.Invoke(h);
        _visualizer.Frame += frame => Broadcast?.Invoke(frame);
        _system.Changed += data => Broadcast?.Invoke(new JsonObject { ["t"] = "sys", ["data"] = data });
        _shortcuts.Changed += list => Broadcast?.Invoke(new JsonObject { ["t"] = "shortcuts", ["list"] = list });
    }

    public void Start()
    {
        _audio.Start();
        _system.Start();
    }

    public JsonObject Snapshot() => new()
    {
        ["t"] = "snapshot",
        ["audio"] = _audio.Current.DeepClone(),
        ["sys"] = _system.Current.DeepClone(),
        ["shortcuts"] = _shortcuts.ListJson(),
    };

    public byte[]? GetIcon(string id) => _shortcuts.GetIcon(id);

    public void ConnectionClosed(Guid connectionId)
    {
        if (_wantVisualizer.TryRemove(connectionId, out _)) _visualizer.SetWanted(!_wantVisualizer.IsEmpty);
    }

    public void Execute(JsonObject msg, Caller caller)
    {
        var op = Str(msg, "op");
        switch (op)
        {
            case "setVolume":
                _audio.Submit(AudioCommand.Volume(Target(msg), Int(msg, "value", 0, 100)));
                break;
            case "setMute":
                _audio.Submit(AudioCommand.Mute(Target(msg), Bool(msg, "mute")));
                break;
            case "setDevice":
                _audio.Submit(AudioCommand.Device(Str(msg, "id") ?? throw new CommandException("bad_value")));
                break;
            case "visualizer":
                if (Bool(msg, "on")) _wantVisualizer[caller.ConnectionId] = 0;
                else _wantVisualizer.TryRemove(caller.ConnectionId, out _);
                _visualizer.SetWanted(!_wantVisualizer.IsEmpty);
                break;
            case "listApps":
                _shortcuts.ListAppsAsync().ContinueWith(t =>
                {
                    if (t.IsCompletedSuccessfully) caller.Reply(new JsonObject { ["t"] = "apps", ["list"] = t.Result });
                    else caller.Reply(new JsonObject { ["t"] = "error", ["code"] = "failed", ["op"] = "listApps" });
                }, TaskScheduler.Default);
                break;
            case "shortcuts.add":
                _shortcuts.Add(Str(msg, "kind"), Str(msg, "ref"), Str(msg, "url"), Str(msg, "name"));
                break;
            case "shortcuts.remove":
                _shortcuts.Remove(Str(msg, "id") ?? throw new CommandException("bad_value"));
                break;
            case "shortcuts.move":
                _shortcuts.Move(Str(msg, "id") ?? throw new CommandException("bad_value"), Int(msg, "to", 0, ShortcutStore.Max - 1));
                break;
            case "run":
                _shortcuts.Run(Str(msg, "id") ?? throw new CommandException("bad_value"));
                break;
            case "power":
                _power.Run(Str(msg, "action"));
                break;
            case "openIcue":
                _power.OpenIcue();
                break;
            case "sound":
                _sounds.Play(Str(msg, "name"));
                break;
            // One backup per hub, not per pairing: a widget re-imported into iCUE gets a new id and a new pairing,
            // and exactly then it must find the old tasks. The widget only loads it when its own storage is empty.
            case "backup.save":
                _backups.Save(BackupId, msg["data"]);
                break;
            case "backup.load":
                caller.Reply(new JsonObject { ["t"] = "backup", ["data"] = _backups.Load(BackupId) });
                break;
            default:
                throw new CommandException("unknown_op");
        }
    }

    // ---------- argument helpers ----------

    internal static string? Str(JsonObject msg, string key) =>
        msg[key] is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;

    internal static bool Bool(JsonObject msg, string key) =>
        msg[key] is JsonValue v && v.TryGetValue<bool>(out var b) ? b : throw new CommandException("bad_value");

    internal static int Int(JsonObject msg, string key, int min, int max)
    {
        if (msg[key] is not JsonValue v) throw new CommandException("bad_value");
        double d;
        if (v.TryGetValue<int>(out var i)) d = i;
        else if (!v.TryGetValue(out d)) throw new CommandException("bad_value");
        if (double.IsNaN(d) || d < min || d > max) throw new CommandException("bad_value");
        return (int)Math.Round(d);
    }

    private static AudioTarget Target(JsonObject msg) => Str(msg, "target") switch
    {
        "master" => AudioTarget.Master,
        "mic" => AudioTarget.Mic,
        _ => throw new CommandException("bad_target"),
    };

    public void Dispose()
    {
        _visualizer.Dispose();
        _system.Dispose();
        _audio.Dispose();
        _shortcuts.Dispose();
    }
}
