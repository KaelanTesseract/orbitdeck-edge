using System.ComponentModel;
using System.Diagnostics;
using OrbitdeckEdge.Hub.Infrastructure;
using OrbitdeckEdge.Hub.Server;

namespace OrbitdeckEdge.Hub.Tray;

/// <summary>
/// First-run assistant, deliberately short (no accounts, nothing to type): welcome → add the widget to iCUE.
/// After an update it opens straight on the widget page, because iCUE only uses a new widget version after a re-import.
/// </summary>
internal sealed class SetupWizard : HubForm
{
    private const int ContentWidth = 520;
    public static readonly string WidgetPackage = Path.Combine(AppContext.BaseDirectory, "OrbitdeckEdge.icuewidget");

    private readonly Label _heading = new() { AutoSize = true, Font = new Font("Segoe UI", 15f, FontStyle.Bold) };
    private readonly Label _stepLabel = new() { AutoSize = true, ForeColor = SystemColors.GrayText };
    private readonly Panel _content = new() { Dock = DockStyle.Fill };
    private readonly Button _back = new() { Text = Strings.Back };
    private readonly Button _next = new() { Text = Strings.Next };
    private readonly Control[] _pages;
    private readonly string[] _headings = [Strings.WelcomeHeading, Strings.WidgetHeading];
    private readonly Label _widgetHint = new() { AutoSize = true, MaximumSize = new Size(ContentWidth, 0), ForeColor = SystemColors.GrayText };
    private readonly CheckBox _autostart = new() { Text = Strings.OptionAutostart, AutoSize = true, MaximumSize = new Size(ContentWidth, 0) };
    // AutoSize check boxes clip instead of wrapping: give the long one room for two lines.
    private readonly CheckBox _updates = new()
    {
        Text = Strings.OptionUpdates, AutoSize = false, Size = new Size(ContentWidth, 44),
        CheckAlign = ContentAlignment.TopLeft, TextAlign = ContentAlignment.TopLeft,
    };
    private int _page;

    /// <summary>Raised on "Finish" with (autostart, updateCheck).</summary>
    public event Action<bool, bool>? Completed;

    public SetupWizard(bool autostart, bool updateCheck, bool afterUpdate = false) : base(Strings.SetupTitle)
    {
        if (afterUpdate) _headings[^1] = Strings.UpdatedHeading(HubServer.HubVersion);
        ClientSize = new Size(ContentWidth + 40, 420);
        _autostart.Checked = autostart;
        _updates.Checked = updateCheck;

        var header = new FlowLayoutPanel { Dock = DockStyle.Top, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoSize = true, Padding = new Padding(0, 0, 0, 12) };
        header.Controls.Add(_stepLabel);
        header.Controls.Add(_heading);

        _pages = [BuildWelcome(), BuildWidget(afterUpdate)];
        var cancel = new Button { Text = Strings.Cancel, DialogResult = DialogResult.Cancel };
        _back.Click += (_, _) => GoTo(_page - 1);
        _next.Click += (_, _) =>
        {
            if (_page < _pages.Length - 1) { GoTo(_page + 1); return; }
            Completed?.Invoke(_autostart.Checked, _updates.Checked);
            Close();
        };
        CancelButton = cancel;

        Controls.Add(_content);
        Controls.Add(header);
        Controls.Add(ButtonRow(_next, _back, cancel));
        GoTo(afterUpdate ? _pages.Length - 1 : 0);
    }

    private static FlowLayoutPanel Column() => new()
    {
        Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true,
    };

    private static Label Paragraph(string text, bool dim = false) => new()
    {
        Text = text, AutoSize = true, MaximumSize = new Size(ContentWidth, 0), Margin = new Padding(0, 0, 0, 12),
        UseMnemonic = false, // "&" is text here ("Zoom & Co."), not a keyboard shortcut
        ForeColor = dim ? SystemColors.GrayText : SystemColors.ControlText,
    };

    private Control BuildWelcome()
    {
        var col = Column();
        col.Controls.Add(Paragraph(Strings.WelcomeText));
        col.Controls.Add(Paragraph(Strings.PrivacyNote, dim: true));
        return col;
    }

    private Control BuildWidget(bool afterUpdate)
    {
        var col = Column();
        col.Controls.Add(Paragraph(afterUpdate ? Strings.UpdatedText : Strings.WidgetText));
        var install = new Button { Text = Strings.WidgetInstall, AutoSize = true, Padding = new Padding(12, 6, 12, 6), Margin = new Padding(0, 0, 0, 8) };
        install.Click += (_, _) => InstallWidget();
        col.Controls.Add(install);
        col.Controls.Add(_widgetHint);
        col.Controls.Add(new Label { AutoSize = true, Height = 12 });
        col.Controls.Add(_autostart);
        col.Controls.Add(_updates);
        return col;
    }

    private void GoTo(int page)
    {
        _page = Math.Clamp(page, 0, _pages.Length - 1);
        _content.Controls.Clear();
        _content.Controls.Add(_pages[_page]);
        _heading.Text = _headings[_page];
        _stepLabel.Text = Strings.StepOf(_page + 1, _pages.Length);
        _back.Enabled = _page > 0;
        _next.Text = _page == _pages.Length - 1 ? Strings.Finish : Strings.Next;
        AcceptButton = _next;
    }

    /// <summary>.icuewidget files are associated with iCUE: opening one imports the widget.</summary>
    private void InstallWidget()
    {
        if (!File.Exists(WidgetPackage))
        {
            _widgetHint.Text = Strings.WidgetMissing;
            return;
        }
        try
        {
            Process.Start(new ProcessStartInfo(WidgetPackage) { UseShellExecute = true });
        }
        catch (Win32Exception)
        {
            // No file association: show the file so it can be imported by hand.
            _widgetHint.Text = Strings.WidgetOpenFailed + WidgetPackage;
            Process.Start("explorer.exe", $"/select,\"{WidgetPackage}\"");
        }
    }

    internal static void OpenUrl(string url) => Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });

#if DEBUG
    /// <summary>Documentation screenshots.</summary>
    public void RenderPage(int page, string file)
    {
        GoTo(page);
        Application.DoEvents();
        using var bmp = new Bitmap(Width, Height);
        DrawToBitmap(bmp, new Rectangle(0, 0, Width, Height));
        bmp.Save(file, System.Drawing.Imaging.ImageFormat.Png);
    }
#endif
}
