using OrbitdeckEdge.Hub.Infrastructure;
using OrbitdeckEdge.Hub.Server;

namespace OrbitdeckEdge.Hub.Tests;

public class PairingStoreTests : IDisposable
{
    private readonly string _file = Path.Combine(Path.GetTempPath(), $"mde-pairings-{Guid.NewGuid():N}.json");

    public void Dispose() => File.Delete(_file);

    [Fact]
    public void Created_token_verifies_and_wrong_tokens_do_not()
    {
        var store = new PairingStore(_file);
        var (pairing, token) = store.Create("file://");

        Assert.Equal(64, token.Length);
        Assert.Equal(pairing.Id, store.Verify(token)?.Id);
        Assert.Null(store.Verify(new string('0', 64)));
        Assert.Null(store.Verify(""));
        Assert.Null(store.Verify(null));
        Assert.Null(store.Verify(token[..63]));
    }

    [Fact]
    public void Only_the_hash_is_written_to_disk_and_it_survives_a_restart()
    {
        var (_, token) = new PairingStore(_file).Create("file://");

        Assert.DoesNotContain(token, File.ReadAllText(_file));
        Assert.NotNull(new PairingStore(_file).Verify(token));
    }

    [Fact]
    public void Revoke_removes_the_pairing_and_notifies()
    {
        var store = new PairingStore(_file);
        var (pairing, token) = store.Create("file://");
        string? revoked = null;
        store.Revoked += id => revoked = id;

        store.Revoke(pairing.Id);

        Assert.Equal(pairing.Id, revoked);
        Assert.Null(store.Verify(token));
        Assert.Null(new PairingStore(_file).Verify(token));
    }
}

public class LogSanitizerTests
{
    [Fact]
    public void Removes_tokens()
    {
        const string token = "example-access-token-value-0123456789abcdef";
        Assert.DoesNotContain(token, LogSanitizer.Clean($"token={token}"));
    }

    [Fact]
    public void Keeps_normal_text()
    {
        const string text = "Status: Ready (Port 47822, HTTP 200)";
        Assert.Equal(text, LogSanitizer.Clean(text));
    }
}

public class OriginPolicyTests
{
    [Theory]
    [InlineData("null", false, true)]                       // iCUE widget (local file) – verified with iCUE 5.52
    [InlineData(null, false, true)]                         // no browser: local program
    [InlineData("", false, true)]
    [InlineData("https://evil.example", false, false)]      // any website in a browser
    [InlineData("http://localhost:5510", false, false)]     // local test page only with --dev
    [InlineData("http://localhost:5510", true, true)]
    [InlineData("http://127.0.0.1:5510", true, true)]
    [InlineData("https://localhost:5510", true, false)]
    [InlineData("http://localhost.evil.example", true, false)]
    [InlineData("chrome-extension://abcdef", true, false)]
    public void Only_icue_and_local_programs_get_through(string? origin, bool dev, bool allowed) =>
        Assert.Equal(allowed, OriginPolicy.IsAllowed(origin, dev));
}

public class LocalRequestTests
{
    [Theory]
    [InlineData("127.0.0.1", true)]
    [InlineData("::1", true)]
    [InlineData("::ffff:127.0.0.1", true)]
    [InlineData("192.168.1.50", false)]
    [InlineData("10.0.0.2", false)]
    [InlineData("fe80::1", false)]
    public void Only_this_pc_may_connect(string address, bool allowed) =>
        Assert.Equal(allowed, HubServer.IsLocalRequest(new System.Net.IPEndPoint(System.Net.IPAddress.Parse(address), 50000)));

    [Fact]
    public void Missing_endpoint_is_refused() => Assert.False(HubServer.IsLocalRequest(null));
}
