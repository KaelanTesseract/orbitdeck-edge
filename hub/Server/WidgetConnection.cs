using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;
using OrbitdeckEdge.Hub.Infrastructure;
using OrbitdeckEdge.Hub.Core;

namespace OrbitdeckEdge.Hub.Server;

/// <summary>
/// One widget over WebSocket. Protocol: docs/DESIGN.md 2.2.
/// widget → hub: { op: "hello", token, proto } first, then commands ({ op: ... }) or { op: "pair.request" }.
/// hub → widget: welcome / paired / pair_denied / snapshot / audio / sys / shortcuts / v / apps / backup / error.
/// </summary>
internal sealed class WidgetConnection(HubServer server, WebSocket socket, string origin)
{
    private const int MaxMessageBytes = 320 * 1024;   // a task backup may be up to 256 KB (BackupStore.MaxBytes)
    private const int MaxQueuedMessages = 512;
    private static readonly TimeSpan HelloTimeout = TimeSpan.FromSeconds(10);

    private readonly Channel<string> _outbox = Channel.CreateBounded<string>(new BoundedChannelOptions(MaxQueuedMessages)
    {
        SingleReader = true,
        FullMode = BoundedChannelFullMode.DropWrite,
    });
    private readonly CancellationTokenSource _cts = new();
    private bool _helloReceived;
    private int _pairingInProgress;

    public Guid Id { get; } = Guid.NewGuid();
    public string? PairingId { get; private set; }
    public bool IsPaired => PairingId != null;
    public event Action? PairedChanged;

    public async Task RunAsync(CancellationToken serverCt)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(serverCt, _cts.Token);
        var ct = linked.Token;
        var sender = Task.Run(() => SendLoopAsync(ct), ct);
        _ = Task.Delay(HelloTimeout, ct).ContinueWith(_ =>
        {
            if (!_helloReceived) Abort("no hello");
        }, TaskScheduler.Default);

        try
        {
            var buffer = new byte[8 * 1024];
            using var message = new MemoryStream();
            var oversized = false;
            while (socket.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                var result = await socket.ReceiveAsync(buffer, ct);
                if (result.MessageType == WebSocketMessageType.Close) break;
                if (result.MessageType != WebSocketMessageType.Text) { Abort("binary"); break; }

                // an oversized message is skipped to its end and answered with an error; the connection stays
                if (!oversized) message.Write(buffer, 0, result.Count);
                if (message.Length > MaxMessageBytes) { oversized = true; message.SetLength(0); }
                if (!result.EndOfMessage) continue;
                if (oversized)
                {
                    oversized = false;
                    SendJson(new JsonObject { ["t"] = "error", ["code"] = "too_big" });
                    continue;
                }

                var text = Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length);
                message.SetLength(0);
                HandleMessage(text, ct);
            }
        }
        catch (Exception ex) when (ex is WebSocketException or OperationCanceledException or ObjectDisposedException)
        {
        }
        finally
        {
            _outbox.Writer.TryComplete();
            _cts.Cancel();
            server.Core.ConnectionClosed(Id);
            try { await sender; } catch { }
            if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
            {
                try { await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None); } catch { }
            }
            socket.Dispose();
        }
    }

    public void Send(string text)
    {
        if (!_outbox.Writer.TryWrite(text) && !_cts.IsCancellationRequested)
            Abort("client too slow");
    }

    public void Abort(string reason)
    {
        if (_cts.IsCancellationRequested) return;
        Log.Info($"Widget-Verbindung wird geschlossen: {reason}");
        _cts.Cancel();
        try { socket.Abort(); } catch { }
    }

    private void HandleMessage(string text, CancellationToken ct)
    {
        JsonObject? msg;
        try
        {
            msg = JsonNode.Parse(text) as JsonObject;
        }
        catch (JsonException)
        {
            msg = null;
        }
        if (msg == null)
        {
            SendJson(new JsonObject { ["t"] = "error", ["code"] = "bad_json" });
            return;
        }

        var op = msg["op"] is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;
        if (!_helloReceived)
        {
            if (op != "hello") { Abort("expected hello"); return; }
            _helloReceived = true;
            _ = HelloAsync(msg, ct);
            return;
        }

        if (op == "pair.request")
        {
            if (!IsPaired) _ = PairAsync(ct);
            return;
        }
        if (!IsPaired)
        {
            SendJson(new JsonObject { ["t"] = "error", ["code"] = "not_paired" });
            return;
        }
        Execute(msg);
    }

    private async Task HelloAsync(JsonObject msg, CancellationToken ct)
    {
        var proto = msg["proto"] is JsonValue p && p.TryGetValue<int>(out var n) ? n : 0;
        if (proto != HubServer.Protocol)
        {
            SendJson(new JsonObject { ["t"] = "error", ["code"] = "proto_mismatch", ["hubProto"] = HubServer.Protocol, ["hubVersion"] = HubServer.HubVersion });
            return;
        }

        var token = msg["token"] is JsonValue t && t.TryGetValue<string>(out var str) ? str : null;
        if (server.Pairings.Verify(token) is { } pairing)
        {
            Welcome(pairing.Id);
            return;
        }
        await PairAsync(ct);
    }

    private async Task PairAsync(CancellationToken ct)
    {
        if (Interlocked.Exchange(ref _pairingInProgress, 1) == 1) return;
        try
        {
            SendJson(new JsonObject { ["t"] = "pair_pending" });
            if (await server.AskPairingAsync(origin, ct))
            {
                var (pairing, token) = server.Pairings.Create(origin);
                SendJson(new JsonObject { ["t"] = "paired", ["token"] = token });
                Welcome(pairing.Id);
            }
            else
            {
                SendJson(new JsonObject { ["t"] = "pair_denied" });
            }
        }
        catch (OperationCanceledException) { }
        finally
        {
            Interlocked.Exchange(ref _pairingInProgress, 0);
        }
    }

    private void Welcome(string pairingId)
    {
        SendJson(new JsonObject
        {
            ["t"] = "welcome",
            ["proto"] = HubServer.Protocol,
            ["hubVersion"] = HubServer.HubVersion,
            ["iconBase"] = HubServer.BaseUrl + "/icon/",
            ["iconKey"] = server.ImageKey,
        });
        // Mark paired before taking the snapshot: broadcasts queued in between are older than the snapshot
        // and get overwritten by it, so nothing is lost.
        PairingId = pairingId;
        SendJson(server.Core.Snapshot());
        PairedChanged?.Invoke();
    }

    private void Execute(JsonObject msg)
    {
        try
        {
            server.Core.Execute(msg, new Caller(Id, PairingId!, SendJson));
        }
        catch (CommandException ex)
        {
            SendJson(new JsonObject { ["t"] = "error", ["code"] = ex.Code, ["op"] = msg["op"]?.DeepClone() });
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            Log.Warn($"Befehl fehlgeschlagen: {ex.Message}");
            SendJson(new JsonObject { ["t"] = "error", ["code"] = "failed", ["op"] = msg["op"]?.DeepClone() });
        }
    }

    private void SendJson(JsonObject msg) => Send(msg.ToJsonString());

    private async Task SendLoopAsync(CancellationToken ct)
    {
        await foreach (var text in _outbox.Reader.ReadAllAsync(ct))
        {
            if (socket.State != WebSocketState.Open) break;
            await socket.SendAsync(Encoding.UTF8.GetBytes(text), WebSocketMessageType.Text, true, ct);
        }
    }
}
