using OrbitdeckEdge.Hub.Infrastructure;

namespace OrbitdeckEdge.Hub.Tests;

public class HubSettingsTests
{
    [Fact]
    public void First_start_is_detected_and_is_not_an_update()
    {
        var s = new HubSettings();
        Assert.True(s.IsFirstRun);
        Assert.False(s.NoteStartedVersion("0.4.0"));
        Assert.False(s.IsFirstRun);
    }

    [Fact]
    public void A_new_version_counts_as_update_once()
    {
        var s = new HubSettings { LastVersion = "0.3.0" };
        Assert.True(s.NoteStartedVersion("0.4.0"));
        Assert.False(s.NoteStartedVersion("0.4.0"));
    }

    [Fact]
    public void Settings_survive_a_save_and_load()
    {
        var file = Path.Combine(Path.GetTempPath(), $"ode-settings-{Guid.NewGuid():N}.json");
        try
        {
            new HubSettings { UpdateCheck = true, LastVersion = "0.4.0" }.Save(file);
            var s = HubSettings.Load(file);
            Assert.True(s.UpdateCheck);
            Assert.Equal("0.4.0", s.LastVersion);
        }
        finally { File.Delete(file); }
    }
}

public class UpdateCheckerTests
{
    [Theory]
    [InlineData("v0.4.1", "0.4.0", true)]
    [InlineData("v0.4.0", "0.4.0", false)]
    [InlineData("v0.3.9", "0.4.0", false)]
    [InlineData("nonsense", "0.4.0", false)]
    public void Only_real_newer_versions_count(string tag, string current, bool newer) =>
        Assert.Equal(newer, UpdateChecker.IsNewer(tag, current));
}
