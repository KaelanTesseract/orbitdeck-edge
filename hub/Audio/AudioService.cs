using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using OrbitdeckEdge.Hub.Infrastructure;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;

namespace OrbitdeckEdge.Hub.Audio;

internal enum AudioTarget { Master, Mic }

/// <summary>One widget request for the audio thread.</summary>
internal sealed record AudioCommand(string Kind, AudioTarget Target, int Value, bool Flag, string? DeviceId)
{
    public static AudioCommand Volume(AudioTarget target, int percent) => new("volume", target, percent, false, null);
    public static AudioCommand Mute(AudioTarget target, bool mute) => new("mute", target, 0, mute, null);
    public static AudioCommand Device(string id) => new("device", AudioTarget.Master, 0, false, id);
}

/// <summary>
/// Output devices, master volume/mute of the default output and volume/mute of the default microphone.
/// Runs on one dedicated MTA thread (Core Audio COM objects never leave it, see Mixdeck spike): rescans every
/// 500 ms and at once on device events, applies queued widget commands, raises <see cref="Changed"/> with the
/// new state when something differs. Switching the default device sets Console + Multimedia only, so the
/// communications device (e.g. Sonar Chat) stays as it is.
/// </summary>
internal sealed class AudioService : IDisposable
{
    private static readonly TimeSpan ScanInterval = TimeSpan.FromMilliseconds(500);

    private readonly Thread _thread;
    private readonly AutoResetEvent _wake = new(false);
    private readonly ConcurrentQueue<AudioCommand> _commands = new();
    private volatile bool _stop;
    private volatile bool _rescan = true;
    private string _lastJson = "";
    private string? _lastError;
    private JsonObject _current = new() { ["devices"] = new JsonArray(), ["device"] = null, ["canSwitch"] = false, ["master"] = null, ["mic"] = null };

    // audio-thread state
    private MMDeviceEnumerator? _enumerator;
    private NotificationClient? _notifications;
    private MMDevice? _output;
    private MMDevice? _mic;
    private bool _canSwitch;

    public JsonObject Current { get { lock (_wake) return (JsonObject)_current.DeepClone(); } }
    public bool Healthy { get; private set; }
    public event Action<JsonObject>? Changed;
    public event Action<bool>? HealthChanged;

    public AudioService()
    {
        _thread = new Thread(Run) { IsBackground = true, Name = "Audio" };
        _thread.SetApartmentState(ApartmentState.MTA);
    }

    public void Start() => _thread.Start();

    public void Submit(AudioCommand command)
    {
        _commands.Enqueue(command);
        _wake.Set();
    }

    public void Dispose()
    {
        _stop = true;
        _wake.Set();
        if (_thread.IsAlive) _thread.Join(TimeSpan.FromSeconds(2));
    }

    private void Run()
    {
        var nextScan = DateTime.MinValue;
        while (!_stop)
        {
            try
            {
                if (_enumerator == null) Init();
                var changedByCommand = ApplyCommands();
                if (_rescan || changedByCommand || DateTime.UtcNow >= nextScan)
                {
                    _rescan = false;
                    Scan();
                    nextScan = DateTime.UtcNow + ScanInterval;
                }
                SetHealthy(true);
            }
            catch (Exception ex) when (ex is COMException or InvalidCastException or UnauthorizedAccessException)
            {
                var text = $"{ex.GetType().Name}: {ex.Message}";
                if (text != _lastError) Log.Warn($"Audio-Fehler, starte neu: {text}");
                _lastError = text;
                Reset();
                SetHealthy(false);
                _wake.WaitOne(TimeSpan.FromSeconds(2));
                continue;
            }
            _wake.WaitOne(ScanInterval);
        }
        Reset();
    }

    private void Init()
    {
        _enumerator = new MMDeviceEnumerator();
        _notifications = new NotificationClient(() => { _rescan = true; _wake.Set(); });
        _enumerator.RegisterEndpointNotificationCallback(_notifications);
        _canSwitch = PolicyConfig.IsAvailable();
        if (!_canSwitch) Log.Warn("Standardgerät wechseln ist auf diesem Windows nicht verfügbar.");
    }

    private void Reset()
    {
        try
        {
            if (_enumerator != null && _notifications != null) _enumerator.UnregisterEndpointNotificationCallback(_notifications);
        }
        catch (COMException) { }
        _output?.Dispose();
        _mic?.Dispose();
        _output = _mic = null;
        _enumerator?.Dispose();
        _enumerator = null;
        _notifications = null;
    }

    private void SetHealthy(bool healthy)
    {
        if (Healthy == healthy) return;
        Healthy = healthy;
        if (healthy) _lastError = null;
        HealthChanged?.Invoke(healthy);
    }

    /// <summary>Applies queued commands; only the last value per target counts (a dragged slider sends many).</summary>
    private bool ApplyCommands()
    {
        if (_commands.IsEmpty) return false;
        var latest = new Dictionary<string, AudioCommand>();
        while (_commands.TryDequeue(out var c)) latest[c.Kind + ":" + c.Target] = c;
        foreach (var c in latest.Values)
        {
            switch (c.Kind)
            {
                case "volume":
                    if (Device(c.Target) is { } dv) dv.AudioEndpointVolume.MasterVolumeLevelScalar = c.Value / 100f;
                    break;
                case "mute":
                    if (Device(c.Target) is { } dm) dm.AudioEndpointVolume.Mute = c.Flag;
                    break;
                case "device":
                    SwitchDevice(c.DeviceId!);
                    break;
            }
        }
        return true;
    }

    private MMDevice? Device(AudioTarget target) => target == AudioTarget.Master ? _output : _mic;

    private void SwitchDevice(string id)
    {
        if (!_canSwitch) return;
        var known = _enumerator!.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active).Any(d => { var same = d.ID == id; d.Dispose(); return same; });
        if (!known) { Log.Warn("Gerätewechsel abgelehnt: unbekanntes Gerät."); return; }
        PolicyConfig.SetDefault(id);
        _rescan = true;
    }

    private void Scan()
    {
        var en = _enumerator!;
        var devices = new JsonArray();
        foreach (var d in en.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
        {
            devices.Add(new JsonObject { ["id"] = d.ID, ["name"] = ShortName(d) });
            d.Dispose();
        }
        _output?.Dispose();
        _mic?.Dispose();
        _output = Default(en, DataFlow.Render, Role.Multimedia);
        _mic = Default(en, DataFlow.Capture, Role.Console);

        var state = new JsonObject
        {
            ["devices"] = devices,
            ["device"] = _output?.ID,
            ["canSwitch"] = _canSwitch,
            ["master"] = Channel(_output),
            ["mic"] = Channel(_mic),
        };
        var json = state.ToJsonString();
        if (json == _lastJson) return;
        _lastJson = json;
        lock (_wake) _current = state;
        Changed?.Invoke((JsonObject)state.DeepClone());
    }

    private static JsonObject? Channel(MMDevice? device)
    {
        if (device == null) return null;
        var v = device.AudioEndpointVolume;
        return new JsonObject { ["name"] = ShortName(device), ["volume"] = (int)Math.Round(v.MasterVolumeLevelScalar * 100), ["mute"] = v.Mute };
    }

    private static MMDevice? Default(MMDeviceEnumerator en, DataFlow flow, Role role)
    {
        try { return en.HasDefaultAudioEndpoint(flow, role) ? en.GetDefaultAudioEndpoint(flow, role) : null; }
        catch (COMException) { return null; }
    }

    /// <summary>"SteelSeries Sonar - Gaming" instead of the long name with the adapter in brackets.</summary>
    private static string ShortName(MMDevice device)
    {
        try
        {
            var store = device.Properties;
            if (store.Contains(PropertyKeys.PKEY_Device_DeviceDesc) && store[PropertyKeys.PKEY_Device_DeviceDesc].Value is string desc && desc.Length > 0)
                return desc;
        }
        catch (COMException) { }
        return device.FriendlyName;
    }

    private sealed class NotificationClient(Action changed) : IMMNotificationClient
    {
        public void OnDeviceStateChanged(string deviceId, DeviceState newState) => changed();
        public void OnDeviceAdded(string pwstrDeviceId) => changed();
        public void OnDeviceRemoved(string deviceId) => changed();
        public void OnDefaultDeviceChanged(DataFlow flow, Role role, string defaultDeviceId) => changed();
        public void OnPropertyValueChanged(string pwstrDeviceId, PropertyKey key) { }
    }
}
