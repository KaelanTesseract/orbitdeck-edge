using System.Net.NetworkInformation;
using System.Text.Json.Nodes;
using OrbitdeckEdge.Hub.Audio;
using OrbitdeckEdge.Hub.Core;
using OrbitdeckEdge.Hub.Shortcuts;
using OrbitdeckEdge.Hub.SystemInfo;

namespace OrbitdeckEdge.Hub.Tests;

public class ShortcutStoreTests : IDisposable
{
    private readonly string _file = Path.Combine(Path.GetTempPath(), $"ode-shortcuts-{Guid.NewGuid():N}.json");
    private static string? Catalog(string r) => r == "Spotify.exe" ? "Spotify" : null;

    public void Dispose() { if (File.Exists(_file)) File.Delete(_file); }

    [Fact]
    public void Apps_must_come_from_the_catalog()
    {
        var store = new ShortcutStore(_file);
        Assert.Equal("Spotify", store.Add("app", "Spotify.exe", null, Catalog).Name);
        var ex = Assert.Throws<CommandException>(() => store.Add("app", @"C:\evil.exe", null, Catalog));
        Assert.Equal("not_found", ex.Code);
    }

    [Fact]
    public void Folders_only_from_the_known_list()
    {
        var store = new ShortcutStore(_file);
        store.Add("folder", "downloads", null, Catalog);
        Assert.Equal("bad_value", Assert.Throws<CommandException>(() => store.Add("folder", @"C:\Windows", null, Catalog)).Code);
    }

    [Fact]
    public void At_most_twelve_and_survives_reload_with_order()
    {
        var store = new ShortcutStore(_file);
        for (var i = 0; i < ShortcutStore.Max; i++) store.Add("url", $"https://site{i}.example.com", null, Catalog);
        Assert.Equal("too_many", Assert.Throws<CommandException>(() => store.Add("url", "https://x.example.com", null, Catalog)).Code);
        var last = store.Items[^1];
        store.Move(last.Id, 0);
        store.Remove(store.Items[1].Id);
        var again = new ShortcutStore(_file);
        Assert.Equal(ShortcutStore.Max - 1, again.Items.Count);
        Assert.Equal(last.Id, again.Items[0].Id);
    }

    [Theory]
    [InlineData("example.com", "https://example.com/")]
    [InlineData("http://example.com/a?b=1", "http://example.com/a?b=1")]
    [InlineData("https://www.youtube.com", "https://www.youtube.com/")]
    [InlineData("javascript:alert(1)", null)]
    [InlineData("file:///C:/Windows/System32/cmd.exe", null)]
    [InlineData("ftp://example.com", null)]
    [InlineData("https://user:pw@example.com", null)]
    [InlineData("https://exa mple.com", null)]
    [InlineData("", null)]
    public void Urls_are_http_only(string input, string? expected) => Assert.Equal(expected, ShortcutStore.NormalizeUrl(input));

    [Fact]
    public void Names_are_trimmed_and_short()
    {
        var store = new ShortcutStore(_file);
        var s = store.Add("url", "https://example.com", "  " + new string('x', 80) + "\u0007", Catalog);
        Assert.Equal(40, s.Name.Length);
        Assert.Equal("example.com", store.Add("url", "https://www.example.com", null, Catalog).Name);
    }
}

public class BandAnalyzerTests
{
    [Fact]
    public void Silence_gives_flat_zero_bands()
    {
        var a = new BandAnalyzer(BandAnalyzer.Bands);
        var frame = a.Analyze(new float[2048], 48000);
        Assert.Equal(BandAnalyzer.Bands, frame.Length);
        Assert.All(frame, v => Assert.Equal(0, v));
    }

    [Fact]
    public void A_tone_lights_its_band_most()
    {
        var a = new BandAnalyzer(BandAnalyzer.Bands);
        var n = BandAnalyzer.FftSizeFor(96000);
        var w = new float[n];
        for (var i = 0; i < n; i++) w[i] = (float)(0.05 * Math.Sin(2 * Math.PI * 1000 * i / 96000.0));   // quiet 1 kHz at 96 kHz (Sonar)
        int[] frame = [];
        for (var k = 0; k < 5; k++) frame = a.Analyze(w, 96000);
        var loudest = Array.IndexOf(frame, frame.Max());
        var expected = (int)(Math.Log(1000 / 40.0) / Math.Log(16000 / 40.0) * BandAnalyzer.Bands);
        Assert.InRange(loudest, expected - 1, expected + 1);
        Assert.True(frame.Max() > 80, "auto gain lifts a quiet tone");
        Assert.True(frame[0] < 30 && frame[^1] < 30, "far away bands stay low");
    }

    [Fact]
    public void Fft_size_gives_about_20_hz_per_bin()
    {
        Assert.Equal(2048, BandAnalyzer.FftSizeFor(48000));
        Assert.Equal(4096, BandAnalyzer.FftSizeFor(96000));
    }
}

public class NetFilterTests
{
    private static AdapterSample A(string name, bool gw, NetworkInterfaceType type = NetworkInterfaceType.Ethernet, string desc = "", bool up = true) =>
        new(name, desc, type, up, gw, 1000, 100);

    [Fact]
    public void Vpn_without_gateway_and_virtual_switches_do_not_count_twice()
    {
        var list = new[]
        {
            A("Ethernet", gw: true),
            A("NordLynx", gw: false, desc: "NordLynx Tunnel"),
            A("vEthernet (WSL (Hyper-V firewall))", gw: true, desc: "Hyper-V Virtual Ethernet Adapter"),
            A("Loopback Pseudo-Interface 1", gw: false, NetworkInterfaceType.Loopback),
            A("WLAN", gw: true, NetworkInterfaceType.Wireless80211, up: false),
        };
        Assert.Equal((1000L, 100L), NetFilter.Sum(list));
    }
}

public class BackupStoreTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory("ode-backup-").FullName;
    public void Dispose() => Directory.Delete(_dir, true);

    [Fact]
    public void Round_trip_per_widget()
    {
        var store = new BackupStore(_dir);
        Assert.Null(store.Load("pairing1"));
        store.Save("pairing1", new JsonObject { ["tasks"] = new JsonArray("a") });
        Assert.Equal("a", store.Load("pairing1")!["tasks"]![0]!.GetValue<string>());
        Assert.Null(store.Load("pairing2"));
    }

    [Fact]
    public void Rejects_too_big_non_objects_and_bad_ids()
    {
        var store = new BackupStore(_dir);
        Assert.Equal("too_big", Assert.Throws<CommandException>(() => store.Save("pairing1", new JsonObject { ["x"] = new string('a', BackupStore.MaxBytes) })).Code);
        Assert.Equal("bad_value", Assert.Throws<CommandException>(() => store.Save("pairing1", JsonValue.Create(5))).Code);
        Assert.Equal("bad_value", Assert.Throws<CommandException>(() => store.Save(@"..\..\evil", new JsonObject())).Code);
    }
}

public class CommandArgsTests
{
    [Fact]
    public void Numbers_are_range_checked()
    {
        Assert.Equal(42, HubCore.Int(new JsonObject { ["value"] = 42 }, "value", 0, 100));
        Assert.Equal(43, HubCore.Int(new JsonObject { ["value"] = 42.6 }, "value", 0, 100));
        Assert.Throws<CommandException>(() => HubCore.Int(new JsonObject { ["value"] = 101 }, "value", 0, 100));
        Assert.Throws<CommandException>(() => HubCore.Int(new JsonObject { ["value"] = "50" }, "value", 0, 100));
        Assert.Throws<CommandException>(() => HubCore.Int(new JsonObject(), "value", 0, 100));
        Assert.Throws<CommandException>(() => HubCore.Bool(new JsonObject { ["mute"] = "true" }, "mute"));
    }
}

public class PowerAndSoundTests
{
    [Fact]
    public void Only_four_fixed_commands_and_dry_run_in_tests()
    {
        var p = new PowerActions(dryRun: true);
        Assert.Equal("bad_value", Assert.Throws<CommandException>(() => p.Run("format c:")).Code);
        Assert.Equal("bad_value", Assert.Throws<CommandException>(() => p.Run(null)).Code);
        p.Run("shutdown");
        Assert.Equal("shutdown", p.LastDryRun);
        p.Run("restart");                       // within the cooldown: ignored
        Assert.Equal("shutdown", p.LastDryRun);
    }

    [Fact]
    public void Generated_wav_is_valid_pcm()
    {
        var wav = Sounds.Wav([(440, 0.1)]);
        Assert.Equal("RIFF", System.Text.Encoding.ASCII.GetString(wav, 0, 4));
        Assert.Equal("WAVE", System.Text.Encoding.ASCII.GetString(wav, 8, 4));
        Assert.Equal(wav.Length - 8, BitConverter.ToInt32(wav, 4));
        Assert.Equal(44 + 2205 * 2, wav.Length);
        Assert.Equal("bad_value", Assert.Throws<CommandException>(() => new Sounds { Muted = true }.Play("siren")).Code);
    }
}
