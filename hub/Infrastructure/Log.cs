using System.Text;
using System.Text.RegularExpressions;

namespace OrbitdeckEdge.Hub.Infrastructure;

/// <summary>
/// Small file logger. Only technical events are logged; every line passes through
/// <see cref="LogSanitizer"/> as a safety net against tokens. Files older than
/// 7 days are deleted, a single file stops growing at 5 MB.
/// </summary>
internal static class Log
{
    private const long MaxFileBytes = 5 * 1024 * 1024;
    private static readonly object Gate = new();
    private static readonly Encoding Utf8NoBom = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
    private static string? _dir;

    public static void Init(string dir)
    {
        _dir = dir;
        foreach (var file in Directory.EnumerateFiles(dir, "hub-*.log"))
        {
            try
            {
                if (File.GetLastWriteTimeUtc(file) < DateTime.UtcNow.AddDays(-7)) File.Delete(file);
            }
            catch (IOException) { /* in use – try again next start */ }
        }
    }

    public static string? CurrentFile => _dir == null ? null : Path.Combine(_dir, $"hub-{DateTime.Now:yyyyMMdd}.log");

    public static void Info(string message) => Write("INFO", message);
    public static void Warn(string message) => Write("WARN", message);
    public static void Error(string message, Exception? ex = null) =>
        Write("ERROR", ex == null ? message : $"{message} ({ex.GetType().Name}: {ex.Message})");

    private static void Write(string level, string message)
    {
        var path = CurrentFile;
        if (path == null) return;
        var line = $"{DateTime.Now:HH:mm:ss.fff} {level,-5} {LogSanitizer.Clean(message)}{Environment.NewLine}";
        lock (Gate)
        {
            try
            {
                var info = new FileInfo(path);
                if (info.Exists && info.Length > MaxFileBytes) return;
                File.AppendAllText(path, line, Utf8NoBom);
            }
            catch (IOException) { /* logging must never crash the hub */ }
        }
    }
}

internal static partial class LogSanitizer
{
    // Tokens and keys: long runs of base64/url-safe characters.
    [GeneratedRegex(@"[A-Za-z0-9_\-\.+/=]{30,}")]
    private static partial Regex LongToken();

    public static string Clean(string text) => LongToken().Replace(text, "[redacted]");
}
