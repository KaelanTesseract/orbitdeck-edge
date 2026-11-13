using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;

namespace OrbitdeckEdge.Hub.SystemInfo;

/// <summary>RAM in use and network speed, read once a second; raises <see cref="Changed"/> when the values differ.</summary>
internal sealed class SystemStats : IDisposable
{
    private readonly System.Threading.Timer _timer;
    private readonly object _gate = new();
    private JsonObject _current = new() { ["ram"] = null, ["net"] = null };
    private string _lastJson = "";
    private long _lastRx = -1, _lastTx = -1;
    private DateTime _lastAt;

    public JsonObject Current { get { lock (_gate) return (JsonObject)_current.DeepClone(); } }
    public event Action<JsonObject>? Changed;

    public SystemStats() => _timer = new System.Threading.Timer(_ => Tick(), null, Timeout.Infinite, Timeout.Infinite);

    public void Start() => _timer.Change(0, 1000);

    private void Tick()
    {
        try
        {
            var state = new JsonObject { ["ram"] = ReadRam(), ["net"] = ReadNet() };
            var json = state.ToJsonString();
            lock (_gate)
            {
                if (json == _lastJson) return;
                _lastJson = json;
                _current = state;
            }
            Changed?.Invoke((JsonObject)state.DeepClone());
        }
        catch (Exception ex) when (ex is NetworkInformationException or InvalidOperationException)
        {
            Infrastructure.Log.Warn($"Systemwerte nicht lesbar: {ex.Message}");
        }
    }

    private static JsonObject? ReadRam()
    {
        var ms = new MemoryStatusEx { Length = (uint)Marshal.SizeOf<MemoryStatusEx>() };
        if (!GlobalMemoryStatusEx(ref ms)) return null;
        return new JsonObject { ["used"] = (long)(ms.TotalPhys - ms.AvailPhys), ["total"] = (long)ms.TotalPhys };
    }

    private JsonObject? ReadNet()
    {
        var adapters = NetworkInterface.GetAllNetworkInterfaces().Select(n =>
        {
            var props = n.GetIPProperties();
            var stats = n.GetIPStatistics();
            return new AdapterSample(n.Name, n.Description, n.NetworkInterfaceType, n.OperationalStatus == OperationalStatus.Up,
                props.GatewayAddresses.Any(g => !g.Address.Equals(System.Net.IPAddress.Any) && !g.Address.Equals(System.Net.IPAddress.IPv6Any)),
                stats.BytesReceived, stats.BytesSent);
        }).ToList();
        var (rx, tx) = NetFilter.Sum(adapters);
        var now = DateTime.UtcNow;
        JsonObject? result = null;
        if (_lastRx >= 0)
        {
            var secs = Math.Max(0.2, (now - _lastAt).TotalSeconds);
            // counters can jump back when an adapter goes away: never show negative speed
            result = new JsonObject { ["down"] = (long)Math.Max(0, (rx - _lastRx) / secs), ["up"] = (long)Math.Max(0, (tx - _lastTx) / secs) };
        }
        _lastRx = rx; _lastTx = tx; _lastAt = now;
        return result;
    }

    public void Dispose() => _timer.Dispose();

    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryStatusEx
    {
        public uint Length, MemoryLoad;
        public ulong TotalPhys, AvailPhys, TotalPageFile, AvailPageFile, TotalVirtual, AvailVirtual, AvailExtendedVirtual;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GlobalMemoryStatusEx(ref MemoryStatusEx buffer);
}

internal sealed record AdapterSample(string Name, string Description, NetworkInterfaceType Type, bool Up, bool HasGateway, long Received, long Sent);

/// <summary>
/// Which adapters count as "the internet connection". Only adapters that are up and have a default gateway:
/// a VPN tunnel (e.g. NordLynx) has none and would otherwise count the same traffic twice (spike 2026-11-13);
/// virtual switches (Hyper-V/WSL, VMware, VirtualBox) and loopback never count.
/// </summary>
internal static class NetFilter
{
    private static readonly string[] Virtual = ["hyper-v", "vethernet", "vmware", "virtualbox", "wsl", "loopback", "npcap"];

    public static bool Counts(AdapterSample a) =>
        a.Up && a.HasGateway && a.Type != NetworkInterfaceType.Loopback && a.Type != NetworkInterfaceType.Tunnel &&
        !Virtual.Any(v => a.Name.Contains(v, StringComparison.OrdinalIgnoreCase) || a.Description.Contains(v, StringComparison.OrdinalIgnoreCase));

    public static (long Received, long Sent) Sum(IEnumerable<AdapterSample> adapters)
    {
        long rx = 0, tx = 0;
        foreach (var a in adapters.Where(Counts)) { rx += a.Received; tx += a.Sent; }
        return (rx, tx);
    }
}
