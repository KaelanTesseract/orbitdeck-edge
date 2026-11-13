using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json.Nodes;
using OrbitdeckEdge.Hub.Core;
using OrbitdeckEdge.Hub.Infrastructure;

namespace OrbitdeckEdge.Hub.Shortcuts;

/// <summary>An entry the widget may offer as a new shortcut.</summary>
internal sealed record CatalogEntry(string Ref, string Name, string Kind);

/// <summary>
/// Shortcuts: the program list (Windows' "All apps" = shell:AppsFolder, Store apps included), icons, and starting
/// a saved shortcut. Shell work runs on one STA thread. Only saved shortcuts can be started; app references must
/// come from the catalog, folders from <see cref="KnownFolders"/>, URLs must be http(s).
/// </summary>
internal sealed class ShortcutService : IDisposable
{
    private static readonly TimeSpan CatalogMaxAge = TimeSpan.FromMinutes(5);
    private static readonly string[] Junk = ["uninstall", "deinstall", "readme", "help", "hilfe", "documentation", "license", "website", "release notes"];

    private readonly ShortcutStore _store;
    private readonly bool _dryRun;
    private readonly BlockingCollection<Action> _sta = new();
    private readonly Thread _thread;
    private readonly ConcurrentDictionary<string, byte[]> _icons = new();        // shortcut id -> png
    private readonly ConcurrentDictionary<string, byte[]> _catalogIcons = new(); // "c-<hash>" -> png (for the picker)
    private readonly ConcurrentDictionary<string, string> _iconRefs = new();     // "c-<hash>" -> catalog reference
    private List<CatalogEntry> _catalog = [];
    private DateTime _catalogAt = DateTime.MinValue;

    public string? LastDryRun { get; private set; }
    public event Action<JsonArray>? Changed;

    public ShortcutService(ShortcutStore store, bool dryRun)
    {
        _store = store;
        _dryRun = dryRun;
        _thread = new Thread(() => { foreach (var work in _sta.GetConsumingEnumerable()) work(); }) { IsBackground = true, Name = "Shell" };
        _thread.SetApartmentState(ApartmentState.STA);
        _thread.Start();
        // icons of saved shortcuts in the background
        foreach (var s in store.Items) QueueIcon(s);
    }

    public JsonArray ListJson() => _store.ToJson(s => _icons.ContainsKey(s.Id));

    /// <summary>
    /// Shortcut icons are ready in memory; picker icons ("c-…") are made on first request and then cached, so the
    /// program list itself arrives at once (making all ~180 icons up front took over 20 s on a cold start).
    /// </summary>
    public byte[]? GetIcon(string id)
    {
        if (_icons.TryGetValue(id, out var png)) return png;
        if (_catalogIcons.TryGetValue(id, out var c)) return c;
        if (!_iconRefs.TryGetValue(id, out var reference)) return null;
        var task = OnSta(() => ShellIcons.Png(@"shell:AppsFolder\" + reference));
        if (!task.Wait(TimeSpan.FromSeconds(5)) || task.Result is not { } made) return null;
        _catalogIcons[id] = made;
        return made;
    }

    /// <summary>All programs plus the standard folders; each app with an icon id for the picker.</summary>
    public Task<JsonArray> ListAppsAsync() => OnSta(() =>
    {
        var apps = Catalog(force: true);
        var arr = new JsonArray();
        foreach (var f in KnownFolders.Keys) arr.Add(new JsonObject { ["kind"] = "folder", ["ref"] = f, ["name"] = KnownFolders.DisplayName(f) });
        foreach (var a in apps)
        {
            var iconId = "c-" + Hash(a.Ref);
            _iconRefs[iconId] = a.Ref;
            arr.Add(new JsonObject { ["kind"] = "app", ["ref"] = a.Ref, ["name"] = a.Name, ["icon"] = iconId });
        }
        return arr;
    });

    public void Add(string? kind, string? reference, string? url, string? name)
    {
        var item = kind switch
        {
            "app" => _store.Add("app", reference ?? throw new CommandException("bad_value"), name, AppName),
            "folder" => _store.Add("folder", reference ?? throw new CommandException("bad_value"), name, AppName),
            "url" => _store.Add("url", url ?? throw new CommandException("bad_value"), name, AppName),
            _ => throw new CommandException("bad_value"),
        };
        Log.Info($"Shortcut hinzugefügt ({item.Kind}).");
        if (item.Kind == "app") QueueIcon(item);
        Changed?.Invoke(ListJson());
    }

    public void Remove(string id)
    {
        _store.Remove(id);
        _icons.TryRemove(id, out _);
        Changed?.Invoke(ListJson());
    }

    public void Move(string id, int to)
    {
        _store.Move(id, to);
        Changed?.Invoke(ListJson());
    }

    public void Run(string id)
    {
        var s = _store.Find(id) ?? throw new CommandException("not_found");
        if (_dryRun) { LastDryRun = s.Kind + ":" + s.Ref; Log.Info($"Shortcut-Start (Testmodus): {s.Kind}"); return; }
        try
        {
            switch (s.Kind)
            {
                case "app":
                    StartExplorer(@"shell:AppsFolder\" + s.Ref);
                    break;
                case "folder":
                    StartExplorer(KnownFolders.Path(s.Ref) ?? throw new CommandException("not_found"));
                    break;
                case "url":
                    // re-checked at start time: the file could have been edited by hand
                    var url = ShortcutStore.NormalizeUrl(s.Ref) ?? throw new CommandException("bad_value");
                    Process.Start(new ProcessStartInfo(url) { UseShellExecute = true })?.Dispose();
                    break;
            }
        }
        catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            Log.Warn($"Shortcut ließ sich nicht starten: {ex.Message}");
            throw new CommandException("failed");
        }
    }

    private static void StartExplorer(string target)
    {
        var psi = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe")) { UseShellExecute = false };
        psi.ArgumentList.Add(target);
        Process.Start(psi)?.Dispose();
    }

    /// <summary>Name of a catalog entry, or null if the reference is not in the current program list.</summary>
    private string? AppName(string reference)
    {
        var list = _catalog;
        if (DateTime.UtcNow - _catalogAt > CatalogMaxAge || list.Count == 0) list = OnSta(() => Catalog(force: false)).GetAwaiter().GetResult();
        return list.FirstOrDefault(e => e.Ref == reference)?.Name;
    }

    private void QueueIcon(Shortcut s)
    {
        if (s.Kind != "app") return;
        _sta.Add(() =>
        {
            if (ShellIcons.Png(@"shell:AppsFolder\" + s.Ref) is { } png)
            {
                _icons[s.Id] = png;
                Changed?.Invoke(ListJson());
            }
        });
    }

    /// <summary>Runs on the STA thread: Windows' "All apps" list via the Shell, without uninstallers and help links.</summary>
    private List<CatalogEntry> Catalog(bool force)
    {
        if (!force && _catalog.Count > 0 && DateTime.UtcNow - _catalogAt < CatalogMaxAge) return _catalog;
        var result = new List<CatalogEntry>();
        try
        {
            var shellType = Type.GetTypeFromProgID("Shell.Application") ?? throw new InvalidOperationException("no shell");
            dynamic shell = Activator.CreateInstance(shellType)!;
            dynamic folder = shell.NameSpace("shell:AppsFolder");
            foreach (var item in folder.Items())
            {
                string name = item.Name, path = item.Path;
                if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(path)) continue;
                if (Junk.Any(j => name.Contains(j, StringComparison.OrdinalIgnoreCase))) continue;
                if (path.Contains('"') || path.Any(char.IsControl)) continue;
                result.Add(new CatalogEntry(path, name, "app"));
            }
        }
        catch (Exception ex) when (ex is System.Runtime.InteropServices.COMException or InvalidOperationException or Microsoft.CSharp.RuntimeBinder.RuntimeBinderException)
        {
            Log.Warn($"Programmliste nicht lesbar: {ex.Message}");
        }
        result = result.GroupBy(e => e.Ref).Select(g => g.First()).OrderBy(e => e.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
        _catalog = result;
        _catalogAt = DateTime.UtcNow;
        return result;
    }

    private Task<T> OnSta<T>(Func<T> work)
    {
        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        _sta.Add(() =>
        {
            try { tcs.SetResult(work()); }
            catch (Exception ex) { tcs.SetException(ex); }
        });
        return tcs.Task;
    }

    private static string Hash(string s) =>
        Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(s)))[..16].ToLowerInvariant();

    public void Dispose() => _sta.CompleteAdding();
}
