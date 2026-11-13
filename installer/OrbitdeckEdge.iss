; Orbitdeck Edge – Windows installer (Inno Setup 6)
; Build: iscc /DAppVersion=0.9.0 installer\OrbitdeckEdge.iss
; Expects artifacts\hub\OrbitdeckEdgeHub.exe (dotnet publish -c Release) and artifacts\OrbitdeckEdge.icuewidget.
; No admin rights: installs per user to %LOCALAPPDATA%\Programs\OrbitdeckEdge.

#ifndef AppVersion
  #define AppVersion "0.0.0-dev"
#endif

[Setup]
AppId={{3582A712-9626-472E-AEDC-298B8CB3B070}
AppName=Orbitdeck Edge
AppVersion={#AppVersion}
AppVerName=Orbitdeck Edge {#AppVersion}
AppPublisher=KaelanTesseract
AppPublisherURL=https://github.com/KaelanTesseract/orbitdeck-edge
AppSupportURL=https://github.com/KaelanTesseract/orbitdeck-edge/issues
DefaultDirName={localappdata}\Programs\OrbitdeckEdge
PrivilegesRequired=lowest
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
OutputDir=..\artifacts\installer
OutputBaseFilename=OrbitdeckEdge-Setup-{#AppVersion}
SetupIconFile=..\hub\Resources\app.ico
UninstallDisplayIcon={app}\OrbitdeckEdgeHub.exe
UninstallDisplayName=Orbitdeck Edge
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
CloseApplications=no

[Languages]
Name: "de"; MessagesFile: "compiler:Languages\German.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
de.AutostartTask=Orbitdeck Edge Hub mit Windows starten (empfohlen)
en.AutostartTask=Start Orbitdeck Edge Hub with Windows (recommended)
de.LaunchHub=Orbitdeck Edge Hub jetzt starten und einrichten
en.LaunchHub=Start Orbitdeck Edge Hub now and set it up
de.DeleteDataQuestion=Auch alle Orbitdeck-Edge-Daten löschen?%n%nDas entfernt Einstellungen, gekoppelte Widgets, Shortcuts, die Sicherung der Aufgaben und Logs. Bei „Nein“ bleiben sie für eine spätere Neuinstallation erhalten.
en.DeleteDataQuestion=Also delete all Orbitdeck Edge data?%n%nThis removes settings, paired widgets, shortcuts, the task backup and logs. Choose "No" to keep them for a later reinstall.

[Tasks]
Name: "autostart"; Description: "{cm:AutostartTask}"

[Files]
Source: "..\artifacts\hub\OrbitdeckEdgeHub.exe"; DestDir: "{app}"; Flags: ignoreversion
; The setup assistant offers this file to iCUE ("Add widget to iCUE").
Source: "..\artifacts\OrbitdeckEdge.icuewidget"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE"; DestDir: "{app}"; DestName: "LICENSE.txt"; Flags: ignoreversion
Source: "..\PRIVACY.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\THIRD_PARTY_NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Orbitdeck Edge Hub"; Filename: "{app}\OrbitdeckEdgeHub.exe"

[Registry]
; Same value name the hub's tray menu ("Start with Windows") uses, so both stay in sync.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "OrbitdeckEdgeHub"; ValueData: """{app}\OrbitdeckEdgeHub.exe"" --autostart"; Tasks: autostart; Flags: uninsdeletevalue

[Run]
Filename: "{app}\OrbitdeckEdgeHub.exe"; Description: "{cm:LaunchHub}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Folders the hub creates; only removed when empty (data is deleted on request, see below).
Type: dirifempty; Name: "{localappdata}\OrbitdeckEdge\logs"
Type: dirifempty; Name: "{localappdata}\OrbitdeckEdge"
Type: dirifempty; Name: "{userappdata}\OrbitdeckEdge"

[Code]
procedure StopHub;
var
  ResultCode: Integer;
begin
  { The hub is a tray app without a window, so Restart Manager cannot close it politely. }
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM OrbitdeckEdgeHub.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopHub;
  Result := '';
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then
  begin
    StopHub;
    if (not UninstallSilent) and
       (MsgBox(CustomMessage('DeleteDataQuestion'), mbConfirmation, MB_YESNO or MB_DEFBUTTON1) = IDYES) then
      Exec(ExpandConstant('{app}\OrbitdeckEdgeHub.exe'), '--delete-all-data', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    { Autostart may also have been switched on later from the tray menu. }
    RegDeleteValue(HKEY_CURRENT_USER, 'Software\Microsoft\Windows\CurrentVersion\Run', 'OrbitdeckEdgeHub');
  end;
end;
