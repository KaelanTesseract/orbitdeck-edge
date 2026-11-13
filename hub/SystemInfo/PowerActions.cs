using System.Diagnostics;
using System.Runtime.InteropServices;
using OrbitdeckEdge.Hub.Core;
using OrbitdeckEdge.Hub.Infrastructure;

namespace OrbitdeckEdge.Hub.SystemInfo;

/// <summary>
/// The four fixed PC commands plus "open iCUE". Nothing else can be started from here. In test mode
/// (--test-autopair, debug builds only) the commands are only logged, so automated tests never lock or shut down the PC.
/// </summary>
internal sealed class PowerActions(bool dryRun)
{
    private static readonly TimeSpan Cooldown = TimeSpan.FromSeconds(3);
    private DateTime _last = DateTime.MinValue;

    public string? LastDryRun { get; private set; }

    public void Run(string? action)
    {
        if (action is not ("lock" or "taskmgr" or "restart" or "shutdown")) throw new CommandException("bad_value");
        // a stuck button or a reconnecting widget must not fire twice
        if (DateTime.UtcNow - _last < Cooldown) return;
        _last = DateTime.UtcNow;
        Log.Info($"PC-Befehl vom Widget: {action}" + (dryRun ? " (Testmodus, nicht ausgeführt)" : ""));
        if (dryRun) { LastDryRun = action; return; }
        switch (action)
        {
            case "lock":
                if (!LockWorkStation()) throw new CommandException("failed");
                break;
            case "taskmgr":
                Start("taskmgr.exe");
                break;
            case "restart":
                Start(Path.Combine(Environment.SystemDirectory, "shutdown.exe"), "/r", "/t", "0");
                break;
            case "shutdown":
                Start(Path.Combine(Environment.SystemDirectory, "shutdown.exe"), "/s", "/t", "0");
                break;
        }
    }

    /// <summary>Opens iCUE if it is installed in one of its usual places.</summary>
    public void OpenIcue()
    {
        var pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var candidates = new[]
        {
            Path.Combine(pf, "Corsair", "Corsair iCUE5 Software", "iCUE.exe"),
            Path.Combine(pf, "Corsair", "CORSAIR iCUE 5 Software", "iCUE.exe"),
            Path.Combine(pf, "Corsair", "CORSAIR iCUE 4 Software", "iCUE.exe"),
        };
        var exe = candidates.FirstOrDefault(File.Exists) ?? throw new CommandException("not_found");
        if (dryRun) { LastDryRun = "openIcue"; return; }
        Start(exe);
    }

    private static void Start(string file, params string[] args)
    {
        try
        {
            var psi = new ProcessStartInfo(file) { UseShellExecute = false };
            foreach (var a in args) psi.ArgumentList.Add(a);
            if (file.EndsWith("taskmgr.exe", StringComparison.OrdinalIgnoreCase) || file.EndsWith("iCUE.exe", StringComparison.OrdinalIgnoreCase))
                psi.UseShellExecute = true;   // Task Manager asks for elevation itself
            Process.Start(psi)?.Dispose();
        }
        catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            Log.Warn($"Start fehlgeschlagen ({Path.GetFileName(file)}): {ex.Message}");
            throw new CommandException("failed");
        }
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool LockWorkStation();
}
