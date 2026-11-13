namespace OrbitdeckEdge.Hub.Infrastructure;

/// <summary>All places the hub writes to. Roaming = settings/secrets, Local = logs.</summary>
internal static class AppPaths
{
    private static string? _testRoot;

    /// <summary>
    /// Debug builds in test mode use their own folder, so automated tests never touch a real installation's
    /// pairings, shortcuts or task backup (a real hub may be running on the same PC). Call before first use.
    /// </summary>
    public static void UseTestFolder(string root) => _testRoot = root;

    public static string DataDir => Ensure(_testRoot != null ? Path.Combine(_testRoot, "data") : Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "OrbitdeckEdge"));

    public static string LogDir => Ensure(_testRoot != null ? Path.Combine(_testRoot, "logs") : Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OrbitdeckEdge", "logs"));

    public static string SettingsFile => Path.Combine(DataDir, "settings.json");
    public static string PairingFile => Path.Combine(DataDir, "pairings.json");
    public static string ShortcutsFile => Path.Combine(DataDir, "shortcuts.json");

    private static string Ensure(string dir)
    {
        Directory.CreateDirectory(dir);
        return dir;
    }
}
