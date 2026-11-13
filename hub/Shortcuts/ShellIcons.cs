using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace OrbitdeckEdge.Hub.Shortcuts;

/// <summary>
/// 128 px icons with transparency for any shell item (desktop programs, Store apps, folders) through
/// IShellItemImageFactory – the same source the Start menu uses. Must be called on an STA thread.
/// </summary>
internal static class ShellIcons
{
    public const int Size = 128;

    public static byte[]? Png(string parsingName)
    {
        IShellItemImageFactory? factory = null;
        var hbmp = IntPtr.Zero;
        try
        {
            var iid = typeof(IShellItemImageFactory).GUID;
            if (SHCreateItemFromParsingName(parsingName, IntPtr.Zero, ref iid, out factory) != 0 || factory == null) return null;
            // ICONONLY: the program icon, never a thumbnail of a file's content
            if (factory.GetImage(new NativeSize { Width = Size, Height = Size }, SiigbfIconOnly | SiigbfBiggerSizeOk, out hbmp) != 0) return null;
            using var bmp = ToArgb(hbmp);
            using var scaled = new Bitmap(bmp, Size, Size);
            using var ms = new MemoryStream();
            scaled.Save(ms, ImageFormat.Png);
            return ms.ToArray();
        }
        catch (Exception ex) when (ex is COMException or ArgumentException or ExternalException)
        {
            return null;
        }
        finally
        {
            if (hbmp != IntPtr.Zero) DeleteObject(hbmp);
            if (factory != null) Marshal.ReleaseComObject(factory);
        }
    }

    /// <summary>Image.FromHbitmap drops the alpha channel; reading the 32-bit DIB bits directly keeps it.</summary>
    private static Bitmap ToArgb(IntPtr hbmp)
    {
        using var dib = Image.FromHbitmap(hbmp);
        var rect = new Rectangle(0, 0, dib.Width, dib.Height);
        var data = dib.LockBits(rect, ImageLockMode.ReadOnly, dib.PixelFormat);
        try
        {
            using var view = new Bitmap(data.Width, data.Height, data.Stride, PixelFormat.Format32bppPArgb, data.Scan0);   // shell bitmaps are premultiplied
            var copy = new Bitmap(view);
            // some icons come without any alpha: then the view is fully transparent – fall back to the opaque image
            return HasAlpha(copy) ? copy : ReplaceWith(copy, dib);
        }
        finally
        {
            dib.UnlockBits(data);
        }
    }

    private static bool HasAlpha(Bitmap b)
    {
        for (var y = 0; y < b.Height; y += 4)
            for (var x = 0; x < b.Width; x += 4)
                if (b.GetPixel(x, y).A != 0) return true;
        return false;
    }

    private static Bitmap ReplaceWith(Bitmap copy, Bitmap opaque)
    {
        copy.Dispose();
        return new Bitmap(opaque);
    }

    /// <summary>The user's Downloads folder (it has no SpecialFolder value).</summary>
    public static string? DownloadsFolder()
    {
        var id = new Guid("374DE290-123F-4565-9164-39C4925E467B");
        if (SHGetKnownFolderPath(ref id, 0, IntPtr.Zero, out var p) != 0) return null;
        try { return Marshal.PtrToStringUni(p); }
        finally { Marshal.FreeCoTaskMem(p); }
    }

    private const int SiigbfBiggerSizeOk = 0x1, SiigbfIconOnly = 0x4;

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeSize { public int Width; public int Height; }

    [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItemImageFactory
    {
        [PreserveSig] int GetImage(NativeSize size, int flags, out IntPtr phbm);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
    private static extern int SHCreateItemFromParsingName(string path, IntPtr pbc, ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory factory);

    [DllImport("shell32.dll")]
    private static extern int SHGetKnownFolderPath(ref Guid id, uint flags, IntPtr token, out IntPtr path);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr obj);
}
