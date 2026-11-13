using OrbitdeckEdge.Hub.Infrastructure;
using OrbitdeckEdge.Hub.Server;
using OrbitdeckEdge.Hub.Tray;

namespace OrbitdeckEdge.Hub;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        var mutexName = @"Local\OrbitdeckEdgeHub";
#if DEBUG
        // Test mode never touches a real installation: own data folder, own port, own single-instance lock.
        // Not compiled into release builds.
        if (args.Contains("--test-autopair"))
        {
            AppPaths.UseTestFolder(Path.Combine(Path.GetTempPath(), "OrbitdeckEdge-test"));
            HubServer.UseTestPort(47823);
            mutexName += "-test";
        }
#endif
        // Used by the uninstaller when the user also wants all data gone (in test mode: the test folder).
        if (args.Contains("--delete-all-data"))
        {
            DataReset.DeleteAll(new PairingStore(AppPaths.PairingFile), AppPaths.DataDir, AppPaths.LogDir);
            return 0;
        }
#if DEBUG
        // Documentation screenshots: OrbitdeckEdgeHub.exe --render-wizard <dir> <de|en>
        if (args.Length >= 3 && args[0] == "--render-wizard") return RenderWizard(args[1], args[2]);
#endif

        using var mutex = new Mutex(initiallyOwned: true, mutexName, out var isFirst);
        ApplicationConfiguration.Initialize();
        if (!isFirst)
        {
            MessageBox.Show(Strings.AlreadyRunning, Strings.AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }

        Log.Init(AppPaths.LogDir);
        Log.Info($"Hub startet, Version {HubServer.HubVersion}");

        var autoPair = false;
#if DEBUG
        // Automated end-to-end tests only (tools/hub-probe.mjs). Not compiled into release builds.
        autoPair = args.Contains("--test-autopair");
#endif
        Application.Run(new TrayContext(startedByAutostart: args.Contains("--autostart"), devMode: args.Contains("--dev"), autoPair));
        return 0;
    }

#if DEBUG
    private static int RenderWizard(string dir, string lang)
    {
        // Must happen before Strings is touched: it picks the language once.
        System.Globalization.CultureInfo.CurrentUICulture = new System.Globalization.CultureInfo(lang);
        ApplicationConfiguration.Initialize();
        Directory.CreateDirectory(dir);
        foreach (var (afterUpdate, names) in new[] { (false, new[] { "welcome", "widget" }), (true, new[] { "", "after-update" }) })
        {
            using var wizard = new SetupWizard(autostart: true, updateCheck: false, afterUpdate)
            {
                StartPosition = FormStartPosition.Manual,
                Location = new Point(-4000, -4000),
                ShowInTaskbar = false,
            };
            wizard.Show();
            for (var i = 0; i < names.Length; i++)
                if (names[i].Length > 0) wizard.RenderPage(i, Path.Combine(dir, $"wizard-{i + 1}-{names[i]}.png"));
        }
        return 0;
    }
#endif
}
