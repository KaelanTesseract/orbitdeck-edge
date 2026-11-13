using System.Diagnostics;
using System.Net;
using OrbitdeckEdge.Hub.Audio;
using OrbitdeckEdge.Hub.Core;
using OrbitdeckEdge.Hub.Shortcuts;
using OrbitdeckEdge.Hub.SystemInfo;
using OrbitdeckEdge.Hub.Infrastructure;
using OrbitdeckEdge.Hub.Server;

namespace OrbitdeckEdge.Hub.Tray;

/// <summary>Composition root and tray UI. Audio, visualizer, shell and server run on worker threads.</summary>
internal sealed class TrayContext : ApplicationContext, IPairingPrompt
{
    private static readonly TimeSpan UpdateInterval = TimeSpan.FromDays(1);

    private readonly CancellationTokenSource _cts = new();
    private readonly Control _ui = new();
    private readonly NotifyIcon _tray = new();
    private readonly ToolStripMenuItem _statusItem = new() { Enabled = false };
    private readonly ToolStripMenuItem _autostartItem = new(Strings.MenuAutostart) { CheckOnClick = true };
    private readonly ToolStripMenuItem _updateItem = new(Strings.MenuUpdateCheck) { CheckOnClick = true };
    private readonly HubSettings _settings = HubSettings.Load(AppPaths.SettingsFile);
    private readonly object _settingsGate = new();
    private readonly HubCore _core;
    private readonly HubServer _server;
    private readonly HttpClient _http;
    private readonly UpdateChecker _updates;
    private readonly bool _autoPair;
    private bool _portBusy;
    private string? _updateUrl;
    private Form? _openForm;

    public TrayContext(bool startedByAutostart, bool devMode, bool autoPair)
    {
        _ui.CreateControl(); // gives us a UI-thread handle for BeginInvoke
        _autoPair = autoPair;

        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        _http.DefaultRequestHeaders.UserAgent.ParseAdd($"OrbitdeckEdgeHub/{HubServer.HubVersion}");
        _updates = new UpdateChecker(_http, HubServer.HubVersion);

        // test mode (debug builds, --test-autopair): PC commands, shortcuts and sounds are only logged
        _core = new HubCore(new AudioService(), new Visualizer(), new SystemStats(),
            new ShortcutService(new ShortcutStore(AppPaths.ShortcutsFile), dryRun: autoPair),
            new PowerActions(dryRun: autoPair), new Sounds { Muted = autoPair }, new BackupStore(AppPaths.DataDir));
        _server = new HubServer(_core, new PairingStore(AppPaths.PairingFile), this) { AllowLocalDevPages = devMode };
        if (devMode) Log.Warn("Entwicklermodus: Testseiten von http://localhost sind zugelassen.");
        if (autoPair) Log.Warn("Testmodus: Kopplungen werden ohne Nachfrage erlaubt.");

        BuildTray();
        _core.AudioHealthChanged += _ => _ui.BeginInvoke(UpdateTray);
        _server.ConnectionsChanged += () => _ui.BeginInvoke(UpdateTray);
        _core.Start();

        try
        {
            _server.Start();
            _ = Task.Run(() => _server.RunAsync(_cts.Token));
        }
        catch (HttpListenerException ex)
        {
            _portBusy = true;
            Log.Error($"Port {HubServer.Port} nicht verfügbar", ex);
        }
        _ = Task.Run(() => UpdateLoopAsync(_cts.Token));
        UpdateTray();

        bool firstRun, updated;
        lock (_settingsGate)
        {
            firstRun = _settings.IsFirstRun;
            updated = _settings.NoteStartedVersion(HubServer.HubVersion);
        }
        SaveSettings();
        if (updated)
            _ui.BeginInvoke(() => ShowSetup(afterUpdate: true)); // new widget version: offer the re-import right away
        else if (firstRun && !startedByAutostart)
            _ui.BeginInvoke(() => ShowSetup(afterUpdate: false));
    }

    // ---------- tray ----------

    private void BuildTray()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add(_statusItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(Strings.MenuSetup, null, (_, _) => ShowSetup(afterUpdate: false));
        menu.Items.Add(Strings.MenuPaired, null, (_, _) => ShowForm(new PairedWidgetsForm(_server.Pairings)));
        menu.Items.Add(new ToolStripSeparator());
        _autostartItem.Checked = Autostart.IsEnabled();
        _autostartItem.CheckedChanged += (_, _) => Autostart.Set(_autostartItem.Checked);
        menu.Items.Add(_autostartItem);
        _updateItem.Checked = _settings.UpdateCheck;
        _updateItem.CheckedChanged += (_, _) => SetUpdateCheck(_updateItem.Checked);
        menu.Items.Add(_updateItem);
        menu.Items.Add(Strings.MenuLog, null, (_, _) => OpenLog());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(Strings.MenuDeleteAll, null, (_, _) => DeleteAllData());
        menu.Items.Add(Strings.MenuExit, null, (_, _) => Exit());
        _tray.ContextMenuStrip = menu;
        _tray.MouseClick += (_, e) =>
        {
            if (e.Button == MouseButtons.Left && _server.ConnectedWidgets == 0) ShowSetup(afterUpdate: false);
        };
        _tray.BalloonTipClicked += (_, _) =>
        {
            if (_updateUrl != null) SetupWizard.OpenUrl(_updateUrl);
        };
        _tray.Visible = true;
    }

    private void UpdateTray()
    {
        var (text, state) = _portBusy ? (Strings.StatusPortBusy, TrayState.Problem)
            : !_core.AudioHealthy ? (Strings.StatusAudioProblem, TrayState.Waiting)
            : (Strings.StatusReady(_server.ConnectedWidgets), _server.ConnectedWidgets > 0 ? TrayState.Ok : TrayState.Waiting);
        _statusItem.Text = text;
        _tray.Icon = TrayIcons.Get(state);
        var tip = $"{Strings.AppName}: {text}";
        _tray.Text = tip.Length > 127 ? tip[..127] : tip;
    }

    // ---------- setup ----------

    private void ShowSetup(bool afterUpdate)
    {
        if (_openForm is SetupWizard) { _openForm.Activate(); return; }
        var wizard = new SetupWizard(_autostartItem.Checked || _settings.IsFirstRun, _settings.UpdateCheck, afterUpdate);
        wizard.Completed += (autostart, updates) =>
        {
            _autostartItem.Checked = autostart; // CheckedChanged writes the registry
            _updateItem.Checked = updates;      // CheckedChanged saves the setting
        };
        ShowForm(wizard);
    }

    // ---------- updates (opt-in) ----------

    private void SetUpdateCheck(bool enabled)
    {
        lock (_settingsGate)
        {
            if (_settings.UpdateCheck == enabled) return;
            _settings.UpdateCheck = enabled;
        }
        SaveSettings();
        if (enabled) _ = Task.Run(() => CheckForUpdateAsync(_cts.Token));
    }

    private async Task UpdateLoopAsync(CancellationToken ct)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(30), ct);
            while (!ct.IsCancellationRequested)
            {
                await CheckForUpdateAsync(ct);
                await Task.Delay(UpdateInterval, ct);
            }
        }
        catch (OperationCanceledException) { }
    }

    private async Task CheckForUpdateAsync(CancellationToken ct)
    {
        if (!_settings.UpdateCheck) return;
        if (await _updates.CheckAsync(ct) is not { } update) return;
        _ui.BeginInvoke(() =>
        {
            _updateUrl = update.Url;
            _tray.ShowBalloonTip(10_000, Strings.AppName, Strings.UpdateAvailable(update.Version), ToolTipIcon.Info);
        });
    }

    // ---------- delete all data ----------

    private void DeleteAllData()
    {
        var answer = MessageBox.Show(Strings.DeleteConfirm, Strings.DeleteTitle, MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2);
        if (answer != DialogResult.Yes) return;

        _openForm?.Close();
        _cts.Cancel();
        _core.Dispose();
        Autostart.Set(false);
        DataReset.DeleteAll(_server.Pairings, AppPaths.DataDir, AppPaths.LogDir);
        MessageBox.Show(Strings.DeleteDone, Strings.DeleteTitle, MessageBoxButtons.OK, MessageBoxIcon.Information);
        _tray.Visible = false;
        _tray.Dispose();
        ExitThread();
    }

    // ---------- helpers ----------

    /// <summary>Called from the UI thread.</summary>
    private void SaveSettings()
    {
        lock (_settingsGate)
        {
            try { _settings.Save(AppPaths.SettingsFile); }
            catch (IOException ex) { Log.Warn($"settings.json nicht speicherbar: {ex.Message}"); }
        }
    }

    private void ShowForm(Form form)
    {
        if (_openForm != null && !_openForm.IsDisposed)
        {
            _openForm.Activate();
            form.Dispose();
            return;
        }
        _openForm = form;
        form.FormClosed += (_, _) => _openForm = null;
        form.Show();
        form.Activate();
    }

    private static void OpenLog()
    {
        var file = Log.CurrentFile;
        Process.Start(new ProcessStartInfo(file != null && File.Exists(file) ? file : AppPaths.LogDir) { UseShellExecute = true });
    }

    private void Exit()
    {
        Log.Info("Hub wird beendet.");
        _cts.Cancel();
        _core.Dispose();
        _tray.Visible = false;
        _tray.Dispose();
        ExitThread();
    }

    // ---------- IPairingPrompt ----------

    public Task<bool> AskAsync(string origin, CancellationToken ct)
    {
        if (_autoPair) return Task.FromResult(true);
        var tcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        _ui.BeginInvoke(() =>
        {
            var dialog = new PairingDialog(origin);
            dialog.Result.ContinueWith(t => tcs.TrySetResult(t.Result), TaskScheduler.Default);
            ct.Register(() => _ui.BeginInvoke(() => dialog.Finish(false)));
            dialog.Show();
            System.Media.SystemSounds.Asterisk.Play();
        });
        return tcs.Task;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _cts.Cancel();
            _core.Dispose();
            _tray.Dispose();
            _ui.Dispose();
            _http.Dispose();
        }
        base.Dispose(disposing);
    }
}
