using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace OrbitdeckEdge.Hub.Core;

/// <summary>
/// Safety copy of a widget's tasks and history, one file per paired widget. The widget only loads it when its own
/// storage is empty (e.g. after re-importing it into iCUE). Size-limited; written atomically.
/// </summary>
internal sealed partial class BackupStore(string dir)
{
    public const int MaxBytes = 256 * 1024;

    public void Save(string pairingId, JsonNode? data)
    {
        if (data is not JsonObject) throw new CommandException("bad_value");
        var text = data.ToJsonString();
        if (Encoding.UTF8.GetByteCount(text) > MaxBytes) throw new CommandException("too_big");
        var file = FileFor(pairingId);
        var tmp = file + ".tmp";
        File.WriteAllText(tmp, text);
        File.Move(tmp, file, overwrite: true);
    }

    public JsonNode? Load(string pairingId)
    {
        var file = FileFor(pairingId);
        try
        {
            return File.Exists(file) ? JsonNode.Parse(File.ReadAllText(file)) as JsonObject : null;
        }
        catch (Exception ex) when (ex is IOException or System.Text.Json.JsonException)
        {
            Infrastructure.Log.Warn($"Sicherung nicht lesbar: {ex.Message}");
            return null;
        }
    }

    public void Delete(string pairingId)
    {
        try { File.Delete(FileFor(pairingId)); } catch (IOException) { }
    }

    private string FileFor(string pairingId)
    {
        if (!SafeId().IsMatch(pairingId)) throw new CommandException("bad_value");
        return Path.Combine(dir, $"backup-{pairingId}.json");
    }

    [GeneratedRegex("^[A-Za-z0-9_-]{4,64}$")]
    private static partial Regex SafeId();
}
