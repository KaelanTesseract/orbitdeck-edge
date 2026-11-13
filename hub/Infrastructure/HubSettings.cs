using System.Text.Json;

namespace OrbitdeckEdge.Hub.Infrastructure;

/// <summary>Non-secret settings, stored as plain JSON. Contains no personal data.</summary>
internal sealed class HubSettings
{
    public bool UpdateCheck { get; set; }
    /// <summary>Hub version of the last start – tells a fresh update apart from a normal start.</summary>
    public string? LastVersion { get; set; }

    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public static HubSettings Load(string path)
    {
        try
        {
            if (File.Exists(path))
                return JsonSerializer.Deserialize<HubSettings>(File.ReadAllText(path)) ?? new HubSettings();
        }
        catch (Exception ex) when (ex is IOException or JsonException)
        {
            Log.Warn($"settings.json nicht lesbar, verwende Standardwerte: {ex.Message}");
        }
        return new HubSettings();
    }

    public void Save(string path) => File.WriteAllText(path, JsonSerializer.Serialize(this, JsonOptions));

    /// <summary>Never started before (no version recorded): the setup assistant should open.</summary>
    [System.Text.Json.Serialization.JsonIgnore]
    public bool IsFirstRun => LastVersion == null;

    /// <summary>
    /// Records the running version. True when a hub that ran before starts a new version for the first time:
    /// the widget in iCUE should then be re-imported.
    /// </summary>
    public bool NoteStartedVersion(string version)
    {
        var updated = LastVersion != null && LastVersion != version;
        LastVersion = version;
        return updated;
    }
}
