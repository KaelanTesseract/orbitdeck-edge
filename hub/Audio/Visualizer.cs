using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using NAudio.CoreAudioApi;
using NAudio.Dsp;
using NAudio.Wave;
using OrbitdeckEdge.Hub.Infrastructure;

namespace OrbitdeckEdge.Hub.Audio;

/// <summary>
/// Frequency bands of what the PC plays, for the widget's visualizer. Records the default output device in
/// loopback mode only while at least one widget asks for it. ~30 frames/s with 48 bands (0–100); during silence
/// one empty frame, then nothing. Findings from the spike (2026-11-13): Sonar delivers 96 kHz with 8 channels –
/// only front left/right carry the music; NAudio's FFT divides by N; quiet sources need automatic gain.
/// </summary>
internal sealed class Visualizer : IDisposable
{
    private static readonly TimeSpan FrameInterval = TimeSpan.FromMilliseconds(33);
    private static readonly TimeSpan DeviceCheck = TimeSpan.FromSeconds(2);

    private readonly AutoResetEvent _wake = new(false);
    private readonly object _ringGate = new();
    private volatile bool _wanted;
    private volatile bool _stop;
    private Thread? _thread;
    private float[] _ring = new float[4096];
    private int _ringPos;
    private int _sampleRate = 48000;

    public event Action<JsonObject>? Frame;

    public void SetWanted(bool wanted)
    {
        if (_wanted == wanted) return;
        _wanted = wanted;
        Log.Info(wanted ? "Visualizer an." : "Visualizer aus.");
        if (wanted && (_thread == null || !_thread.IsAlive))
        {
            _thread = new Thread(Run) { IsBackground = true, Name = "Visualizer" };
            _thread.SetApartmentState(ApartmentState.MTA);
            _thread.Start();
        }
        _wake.Set();
    }

    public void Dispose()
    {
        _stop = true;
        _wanted = false;
        _wake.Set();
        _thread?.Join(TimeSpan.FromSeconds(2));
    }

    private void Run()
    {
        var bands = new BandAnalyzer(BandAnalyzer.Bands);
        while (_wanted && !_stop)
        {
            WasapiLoopbackCapture? capture = null;
            MMDeviceEnumerator? en = null;
            try
            {
                en = new MMDeviceEnumerator();
                using var device = en.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
                var deviceId = device.ID;
                capture = new WasapiLoopbackCapture(device);
                var fmt = capture.WaveFormat;
                if (fmt.Encoding != WaveFormatEncoding.IeeeFloat && fmt.Encoding != WaveFormatEncoding.Extensible || fmt.BitsPerSample != 32)
                {
                    Log.Warn($"Visualizer: Format {fmt.Encoding}/{fmt.BitsPerSample} bit wird nicht unterstützt.");
                    _wake.WaitOne(TimeSpan.FromSeconds(10));
                    continue;
                }
                lock (_ringGate)
                {
                    _sampleRate = fmt.SampleRate;
                    _ring = new float[BandAnalyzer.FftSizeFor(fmt.SampleRate)];
                    _ringPos = 0;
                }
                var channels = fmt.Channels;
                capture.DataAvailable += (_, e) => Feed(e.Buffer, e.BytesRecorded, channels);
                capture.StartRecording();
                Log.Info($"Visualizer nimmt auf: {fmt.SampleRate} Hz, {channels} Kanäle.");

                var nextCheck = DateTime.UtcNow + DeviceCheck;
                var silentSent = false;
                while (_wanted && !_stop)
                {
                    _wake.WaitOne(FrameInterval);
                    float[] window;
                    int rate;
                    lock (_ringGate)
                    {
                        window = new float[_ring.Length];
                        for (var i = 0; i < _ring.Length; i++) window[i] = _ring[(_ringPos + i) % _ring.Length];
                        rate = _sampleRate;
                    }
                    var frame = bands.Analyze(window, rate);
                    var silent = frame.All(v => v == 0);
                    if (!silent || !silentSent)
                    {
                        var arr = new JsonArray();
                        foreach (var v in frame) arr.Add(v);
                        Frame?.Invoke(new JsonObject { ["t"] = "v", ["b"] = arr });
                    }
                    silentSent = silent;

                    if (DateTime.UtcNow >= nextCheck)
                    {
                        nextCheck = DateTime.UtcNow + DeviceCheck;
                        using var now = en.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
                        if (now.ID != deviceId) { Log.Info("Visualizer: Standardgerät gewechselt."); break; }
                    }
                }
            }
            catch (Exception ex) when (ex is COMException or InvalidOperationException or ArgumentException)
            {
                Log.Warn($"Visualizer-Fehler: {ex.GetType().Name}: {ex.Message}");
                _wake.WaitOne(TimeSpan.FromSeconds(3));
            }
            finally
            {
                try { capture?.StopRecording(); } catch (Exception) { }
                capture?.Dispose();
                en?.Dispose();
            }
        }
    }

    /// <summary>Called on the capture thread: mixes front left/right to mono into the ring buffer.</summary>
    private void Feed(byte[] buffer, int bytes, int channels)
    {
        var frames = bytes / (4 * channels);
        var used = Math.Min(2, channels);
        lock (_ringGate)
        {
            for (var i = 0; i < frames; i++)
            {
                float sum = 0;
                for (var c = 0; c < used; c++) sum += BitConverter.ToSingle(buffer, (i * channels + c) * 4);
                _ring[_ringPos] = sum / used;
                _ringPos = (_ringPos + 1) % _ring.Length;
            }
        }
    }
}

/// <summary>Turns a window of mono samples into 0–100 band levels with automatic gain (pure, testable).</summary>
internal sealed class BandAnalyzer(int bands)
{
    public const int Bands = 48;
    private const double MinHz = 40, MaxHz = 16000;
    private const float FloorGain = 0.55f, Range = 0.45f, GainDecay = 0.995f;   // floor >= range: silence maps to 0
    private readonly float[] _raw = new float[bands];
    private float _gain = FloorGain;

    /// <summary>~20 Hz per FFT bin: 2048 up to 48 kHz, 4096 above (Sonar runs at 96 kHz).</summary>
    public static int FftSizeFor(int sampleRate) => sampleRate > 50000 ? 4096 : 2048;

    public int[] Analyze(float[] window, int sampleRate)
    {
        var n = window.Length;
        var m = (int)Math.Log2(n);
        var cx = new Complex[n];
        for (var i = 0; i < n; i++)
        {
            cx[i].X = (float)(window[i] * FastFourierTransform.HannWindow(i, n));
            cx[i].Y = 0;
        }
        FastFourierTransform.FFT(true, m, cx);
        var binHz = sampleRate / (double)n;
        for (var b = 0; b < bands; b++)
        {
            var lo = MinHz * Math.Pow(MaxHz / MinHz, b / (double)bands);
            var hi = MinHz * Math.Pow(MaxHz / MinHz, (b + 1) / (double)bands);
            int k0 = Math.Max(1, (int)(lo / binHz)), k1 = Math.Max(k0 + 1, (int)Math.Ceiling(hi / binHz));
            double peak = 0;
            for (var k = k0; k < k1 && k < n / 2; k++)
                peak = Math.Max(peak, Math.Sqrt(cx[k].X * cx[k].X + cx[k].Y * cx[k].Y));
            // NAudio's FFT already divides by N: ×2 for one side of the spectrum, ×2 for the Hann window
            var db = 20 * Math.Log10(peak * 4 + 1e-9);
            _raw[b] = (float)Math.Clamp((db + 90) / 90, 0, 1);
        }
        // automatic gain: follow the loudest band, fall back slowly, never below the floor (silence stays flat)
        var top = _raw.Max();
        _gain = Math.Max(top, Math.Max(FloorGain, _gain * GainDecay));
        var result = new int[bands];
        for (var b = 0; b < bands; b++)
            result[b] = (int)Math.Round(Math.Clamp((_raw[b] - (_gain - Range)) / Range, 0, 1) * 100);
        return result;
    }
}
