using System.Drawing.Drawing2D;
using System.Drawing.Text;

namespace OrbitdeckEdge.Hub.Tray;

internal enum TrayState { Ok, Waiting, Problem }

/// <summary>Draws the tray icon at runtime: a badge with a small ringed planet and a coloured status dot.</summary>
internal static class TrayIcons
{
    private static readonly Dictionary<TrayState, Icon> Cache = [];

    public static Icon Get(TrayState state)
    {
        if (Cache.TryGetValue(state, out var icon)) return icon;
        var dot = state switch
        {
            TrayState.Ok => Color.FromArgb(35, 165, 90),
            TrayState.Waiting => Color.FromArgb(240, 178, 50),
            _ => Color.FromArgb(218, 55, 60),
        };

        using var bmp = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            using var badge = RoundedRect(new Rectangle(1, 1, 30, 30), 8);
            using var fill = new SolidBrush(Color.FromArgb(32, 34, 40));
            g.FillPath(fill, badge);
            // a small ringed planet: back half of the ring, the planet, front half of the ring
            var ringRect = new RectangleF(3, 12.5f, 24, 7);
            using var ringPen = new Pen(Color.FromArgb(245, 205, 150), 2f);
            var state0 = g.Save();
            g.TranslateTransform(15, 16); g.RotateTransform(-14); g.TranslateTransform(-15, -16);
            g.DrawArc(ringPen, ringRect, 180, 180);
            g.Restore(state0);
            using var planet = new LinearGradientBrush(new Rectangle(8, 9, 14, 14), Color.FromArgb(250, 200, 130), Color.FromArgb(150, 75, 25), 45f);
            g.FillEllipse(planet, 8, 9, 14, 14);
            var state1 = g.Save();
            g.TranslateTransform(15, 16); g.RotateTransform(-14); g.TranslateTransform(-15, -16);
            g.DrawArc(ringPen, ringRect, 0, 180);
            g.Restore(state1);
            using var dotBrush = new SolidBrush(dot);
            using var ring = new Pen(Color.FromArgb(30, 31, 34), 2);
            g.FillEllipse(dotBrush, 19, 19, 12, 12);
            g.DrawEllipse(ring, 19, 19, 12, 12);
        }
        icon = Icon.FromHandle(bmp.GetHicon());
        Cache[state] = icon;
        return icon;
    }

    private static GraphicsPath RoundedRect(Rectangle r, int radius)
    {
        var path = new GraphicsPath();
        var d = radius * 2;
        path.AddArc(r.X, r.Y, d, d, 180, 90);
        path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }
}
