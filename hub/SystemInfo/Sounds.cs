using System.Media;
using OrbitdeckEdge.Hub.Core;

namespace OrbitdeckEdge.Hub.SystemInfo;

/// <summary>
/// Plays the widget's sounds on the default output: sound from an iCUE widget stays silent even with the
/// speaker permission (Edge test 2026-11-13), so the hub plays them. The tones are generated, no files.
/// </summary>
internal sealed class Sounds
{
    private static readonly TimeSpan Cooldown = TimeSpan.FromMilliseconds(800);
    private readonly Dictionary<string, byte[]> _wavs = new()
    {
        // three rising beeps, repeated twice: timer is over
        ["alarm"] = Wav([(880, 0.12), (0, 0.06), (988, 0.12), (0, 0.06), (1175, 0.22), (0, 0.35), (880, 0.12), (0, 0.06), (988, 0.12), (0, 0.06), (1175, 0.22)]),
        // soft two-tone chime: break reminder, microphone hint
        ["chime"] = Wav([(660, 0.18), (880, 0.3)]),
    };
    private DateTime _last = DateTime.MinValue;
    private SoundPlayer? _player;   // kept alive while it plays from memory

    public bool Muted { get; init; }

    public void Play(string? name)
    {
        if (name == null || !_wavs.TryGetValue(name, out var wav)) throw new CommandException("bad_value");
        if (DateTime.UtcNow - _last < Cooldown || Muted) return;
        _last = DateTime.UtcNow;
        _player?.Dispose();
        _player = new SoundPlayer(new MemoryStream(wav));
        _player.Play();   // asynchronous
    }

    /// <summary>16-bit mono PCM WAV from (frequency, seconds) pairs; frequency 0 is a pause. Short fades avoid clicks.</summary>
    internal static byte[] Wav((double Hz, double Secs)[] notes)
    {
        const int rate = 22050;
        var samples = new List<short>();
        foreach (var (hz, secs) in notes)
        {
            var n = (int)(rate * secs);
            var fade = Math.Min(n / 2, rate / 100);
            for (var i = 0; i < n; i++)
            {
                var env = Math.Min(1.0, Math.Min(i, n - 1 - i) / (double)Math.Max(1, fade));
                samples.Add(hz <= 0 ? (short)0 : (short)(Math.Sin(2 * Math.PI * hz * i / rate) * 9000 * env));
            }
        }
        using var ms = new MemoryStream();
        using var w = new BinaryWriter(ms);
        var dataBytes = samples.Count * 2;
        w.Write("RIFF"u8); w.Write(36 + dataBytes); w.Write("WAVE"u8);
        w.Write("fmt "u8); w.Write(16); w.Write((short)1); w.Write((short)1); w.Write(rate); w.Write(rate * 2); w.Write((short)2); w.Write((short)16);
        w.Write("data"u8); w.Write(dataBytes);
        foreach (var s in samples) w.Write(s);
        w.Flush();
        return ms.ToArray();
    }
}
