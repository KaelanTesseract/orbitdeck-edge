using OrbitdeckEdge.Hub.Server;

namespace OrbitdeckEdge.Hub.Infrastructure;

/// <summary>
/// "Delete all data": unpairs every widget and deletes every file the hub ever wrote (settings, pairings,
/// shortcuts, task backups, logs). Also used by the uninstaller.
/// </summary>
internal static class DataReset
{
    public static void DeleteAll(PairingStore? pairings, string dataDir, string logDir)
    {
        Log.Info("Alle Daten werden gelöscht.");
        pairings?.RevokeAll();
        DeleteFiles(dataDir, "*");
        DeleteFiles(logDir, "hub-*.log");
    }

    private static void DeleteFiles(string dir, string pattern)
    {
        if (!Directory.Exists(dir)) return;
        foreach (var file in Directory.EnumerateFiles(dir, pattern))
        {
            try { File.Delete(file); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }
    }
}
