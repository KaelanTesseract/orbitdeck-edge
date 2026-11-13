using System.Text.Json;
using System.Text.Json.Nodes;
using OrbitdeckEdge.Hub.Core;

namespace OrbitdeckEdge.Hub.Shortcuts;

/// <summary>One tile in the widget's shortcut grid.</summary>
internal sealed record Shortcut(string Id, string Kind, string Ref, string Name);

/// <summary>
/// The saved shortcut list (max. 12) with all validation – pure apart from the JSON file, so it is easy to test.
/// kind "app": Ref is a "shell:AppsFolder" item (must come from the app list the hub offered),
/// kind "folder": Ref is one of <see cref="KnownFolders.Keys"/>, kind "url": Ref is an absolute http(s) URL.
/// </summary>
internal sealed class ShortcutStore(string file)
{
    public const int Max = 12;
    private const int MaxName = 40;
    private readonly object _gate = new();
    private List<Shortcut> _items = Load(file);

    public IReadOnlyList<Shortcut> Items { get { lock (_gate) return [.. _items]; } }

    public Shortcut Add(string kind, string reference, string? name, Func<string, string?> appName)
    {
        Shortcut item;
        switch (kind)
        {
            case "app":
                var n = appName(reference) ?? throw new CommandException("not_found");   // only what the hub offered
                item = new Shortcut(NewId(), "app", reference, Clean(name) ?? n);
                break;
            case "folder":
                if (!KnownFolders.Keys.Contains(reference)) throw new CommandException("bad_value");
                item = new Shortcut(NewId(), "folder", reference, Clean(name) ?? KnownFolders.DisplayName(reference));
                break;
            case "url":
                var url = NormalizeUrl(reference) ?? throw new CommandException("bad_value");
                item = new Shortcut(NewId(), "url", url, Clean(name) ?? new Uri(url).Host.Replace("www.", ""));
                break;
            default:
                throw new CommandException("bad_value");
        }
        lock (_gate)
        {
            if (_items.Count >= Max) throw new CommandException("too_many");
            _items.Add(item);
            Save();
        }
        return item;
    }

    public void Remove(string id)
    {
        lock (_gate)
        {
            if (_items.RemoveAll(s => s.Id == id) == 0) throw new CommandException("not_found");
            Save();
        }
    }

    public void Move(string id, int to)
    {
        lock (_gate)
        {
            var i = _items.FindIndex(s => s.Id == id);
            if (i < 0) throw new CommandException("not_found");
            var item = _items[i];
            _items.RemoveAt(i);
            _items.Insert(Math.Clamp(to, 0, _items.Count), item);
            Save();
        }
    }

    public Shortcut? Find(string id)
    {
        lock (_gate) return _items.FirstOrDefault(s => s.Id == id);
    }

    /// <summary>Only http(s), no credentials in the URL; a bare "example.com" becomes https://example.com/.</summary>
    internal static string? NormalizeUrl(string? input)
    {
        var text = input?.Trim();
        if (string.IsNullOrEmpty(text) || text.Length > 2000 || text.Any(char.IsControl) || text.Contains(' ')) return null;
        if (!text.Contains("://", StringComparison.Ordinal)) text = "https://" + text;
        if (!Uri.TryCreate(text, UriKind.Absolute, out var uri)) return null;
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) return null;
        if (!string.IsNullOrEmpty(uri.UserInfo) || !uri.Host.Contains('.') && uri.Host != "localhost") return null;
        return uri.AbsoluteUri;
    }

    private static string? Clean(string? name)
    {
        var t = new string((name ?? "").Where(c => !char.IsControl(c)).ToArray()).Trim();
        return t.Length == 0 ? null : t.Length > MaxName ? t[..MaxName] : t;
    }

    private static string NewId() => Guid.NewGuid().ToString("N")[..12];

    private static List<Shortcut> Load(string file)
    {
        try
        {
            if (!File.Exists(file)) return [];
            var list = JsonSerializer.Deserialize<List<Shortcut>>(File.ReadAllText(file)) ?? [];
            return list.Where(s => s.Kind is "app" or "folder" or "url" && !string.IsNullOrEmpty(s.Id) && !string.IsNullOrEmpty(s.Ref))
                       .Take(Max).ToList();
        }
        catch (Exception ex) when (ex is IOException or JsonException)
        {
            Infrastructure.Log.Warn($"shortcuts.json nicht lesbar: {ex.Message}");
            return [];
        }
    }

    private void Save()
    {
        var tmp = file + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(_items));
        File.Move(tmp, file, overwrite: true);
    }

    public JsonArray ToJson(Func<Shortcut, bool> hasIcon)
    {
        var arr = new JsonArray();
        foreach (var s in Items)
            arr.Add(new JsonObject { ["id"] = s.Id, ["kind"] = s.Kind, ["name"] = s.Name, ["icon"] = hasIcon(s), ["url"] = s.Kind == "url" ? s.Ref : null });
        return arr;
    }
}

/// <summary>Folders the widget may link to: always the user's own standard folders, never a free path.</summary>
internal static class KnownFolders
{
    public static readonly string[] Keys = ["desktop", "documents", "downloads", "pictures", "music", "videos"];

    public static string DisplayName(string key)
    {
        var de = System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "de";
        return key switch
        {
            "desktop" => "Desktop",
            "documents" => de ? "Dokumente" : "Documents",
            "downloads" => "Downloads",
            "pictures" => de ? "Bilder" : "Pictures",
            "music" => de ? "Musik" : "Music",
            "videos" => de ? "Videos" : "Videos",
            _ => key,
        };
    }

    public static string? Path(string key) => key switch
    {
        "desktop" => Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
        "documents" => Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
        "pictures" => Environment.GetFolderPath(Environment.SpecialFolder.MyPictures),
        "music" => Environment.GetFolderPath(Environment.SpecialFolder.MyMusic),
        "videos" => Environment.GetFolderPath(Environment.SpecialFolder.MyVideos),
        "downloads" => ShellIcons.DownloadsFolder(),
        _ => null,
    };
}
