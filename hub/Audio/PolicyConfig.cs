using System.Runtime.InteropServices;
using NAudio.CoreAudioApi;

namespace OrbitdeckEdge.Hub.Audio;

/// <summary>
/// Sets the Windows default output device. Windows has no public API for this; the undocumented PolicyConfig COM
/// classes are what the Sound control panel uses. Spike 2026-11-11: <c>CPolicyConfigClient</c> is missing on
/// Windows build 26300, <c>CPolicyConfigVistaClient</c> works – so both are tried.
/// </summary>
internal static class PolicyConfig
{
    [ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c3bc9")]
    private class PolicyConfigClient;

    [ComImport, Guid("294935CE-F637-4E7C-A41B-AB255460B862")]
    private class PolicyConfigVistaClient;

    [ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPolicyConfig
    {
        [PreserveSig] int GetMixFormat();
        [PreserveSig] int GetDeviceFormat();
        [PreserveSig] int ResetDeviceFormat();
        [PreserveSig] int SetDeviceFormat();
        [PreserveSig] int GetProcessingPeriod();
        [PreserveSig] int SetProcessingPeriod();
        [PreserveSig] int GetShareMode();
        [PreserveSig] int SetShareMode();
        [PreserveSig] int GetPropertyValue();
        [PreserveSig] int SetPropertyValue();
        [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string deviceId, Role role);
        [PreserveSig] int SetEndpointVisibility();
    }

    [ComImport, Guid("568b9108-44bf-40b4-9006-86afe5b5a620"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPolicyConfigVista
    {
        [PreserveSig] int GetMixFormat();
        [PreserveSig] int GetDeviceFormat();
        [PreserveSig] int SetDeviceFormat();
        [PreserveSig] int GetProcessingPeriod();
        [PreserveSig] int SetProcessingPeriod();
        [PreserveSig] int GetShareMode();
        [PreserveSig] int SetShareMode();
        [PreserveSig] int GetPropertyValue();
        [PreserveSig] int SetPropertyValue();
        [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string deviceId, Role role);
        [PreserveSig] int SetEndpointVisibility();
    }

    /// <summary>True when one of the two classes can be created on this Windows.</summary>
    public static bool IsAvailable()
    {
        foreach (var create in Factories)
        {
            try
            {
                var obj = create();
                Marshal.ReleaseComObject(obj);
                return true;
            }
            catch (COMException) { }
        }
        return false;
    }

    /// <summary>
    /// Makes the device the default output (console + multimedia). The communications device is left alone on purpose:
    /// setups like SteelSeries Sonar route calls to a separate "Chat" device, and switching speakers/headphones must not
    /// break that.
    /// </summary>
    public static void SetDefault(string deviceId)
    {
        foreach (var role in new[] { Role.Console, Role.Multimedia })
            SetDefault(deviceId, role);
    }

    private static void SetDefault(string deviceId, Role role)
    {
        COMException? last = null;
        foreach (var create in Factories)
        {
            object obj;
            try { obj = create(); }
            catch (COMException ex) { last = ex; continue; }
            try
            {
                var hr = obj switch
                {
                    IPolicyConfig pc => pc.SetDefaultEndpoint(deviceId, role),
                    IPolicyConfigVista vista => vista.SetDefaultEndpoint(deviceId, role),
                    _ => unchecked((int)0x80004002), // E_NOINTERFACE
                };
                Marshal.ThrowExceptionForHR(hr);
                return;
            }
            catch (COMException ex) { last = ex; }
            finally { Marshal.ReleaseComObject(obj); }
        }
        throw last ?? new COMException("PolicyConfig not available");
    }

    private static readonly Func<object>[] Factories =
    [
        () => new PolicyConfigClient(),
        () => new PolicyConfigVistaClient(),
    ];
}
