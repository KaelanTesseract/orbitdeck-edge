# Datenschutz / Privacy – Orbitdeck Edge

[Deutsch](#deutsch) · [English](#english)

---

## Deutsch

**Kurz gesagt:** Orbitdeck Edge hat keine Server, sammelt keine Daten und verbindet sich nicht mit dem Internet. Alles läuft auf deinem PC.

### Mit wem spricht Orbitdeck Edge?

| Ziel | Wozu | Wann |
|---|---|---|
| iCUE (Sensors- und Media-Plugin) | CPU-/GPU-Last und -Temperatur, gerade laufender Titel, Play/Pause/Weiter | im Widget, auch ohne Hub |
| Windows-Audio auf deinem PC | Lautstärke, Stumm, Mikrofon, Ausgabegerät; für den Visualizer wird der Ton **im Arbeitsspeicher** in 48 Zahlen (Frequenzbänder) zerlegt | nur mit Hub; Visualizer nur, solange das Widget ihn anzeigt |
| Windows-Shell | Programmliste wie im Startmenü, Programm-Icons, Shortcuts starten | nur mit Hub, wenn du Shortcuts nutzt |
| Windows-Leistungsdaten | RAM-Belegung und Netzwerk-Geschwindigkeit (nur Summen, keine Verbindungen oder Adressen) | nur mit Hub |
| Das Widget in iCUE, über `localhost:47822` | Daten zwischen Hub und Widget | nur auf diesem PC erreichbar |
| `api.github.com` | Prüfen, ob es eine neue Version gibt | **nur** wenn du „Nach Updates suchen“ einschaltest |

Sonst nichts: keine Telemetrie, keine Analyse, keine Absturzberichte, keine Werbung, kein Tracking, kein Konto. Das Widget fragt in iCUE nur eine einzige Berechtigung an: `localhost`, Port 47822. Webseiten-Shortcuts öffnen sich in deinem normalen Browser; Orbitdeck lädt dafür nichts aus dem Internet (auch keine Favicons).

### Was wird gespeichert?

| Was | Wo | Wie lange |
|---|---|---|
| Optionen, Aufgaben, Fokus-Sitzungen, Verlauf, Timer | im Widget (iCUE-Speicher) | bis du „Alle Daten zurücksetzen“ wählst oder das Widget entfernst |
| Kopplungsschlüssel des Widgets | im Widget (iCUE-Speicher) | bis du das Widget entfernst |
| Sicherung von Aufgaben und Verlauf | `%APPDATA%\OrbitdeckEdge\backup-main.json` | bis Löschen/Deinstallation |
| Shortcuts (Name, Programm-Verweis, Ordner oder Webadresse) | `%APPDATA%\OrbitdeckEdge\shortcuts.json` | bis du sie entfernst |
| Hub-Einstellungen (Update-Suche, zuletzt gestartete Version) | `%APPDATA%\OrbitdeckEdge\settings.json` | bis Löschen/Deinstallation |
| Gekoppelte Widgets | `%APPDATA%\OrbitdeckEdge\pairings.json` – nur ein Prüfwert (Hash), nie der Schlüssel selbst | bis du die Kopplung aufhebst |
| Technisches Protokoll | `%LOCALAPPDATA%\OrbitdeckEdge\logs\` – ohne Aufgaben, Titel oder Programmnamen | höchstens 7 Tage |

**Nie gespeichert oder übertragen:** Ton, was du hörst, Musiktitel, Sensor- und Netzwerkwerte. Diese Werte existieren nur im Arbeitsspeicher und gehen nur an das Widget auf diesem PC.

### Deine Kontrolle

- **Im Widget:** Optionen → „Alle Daten zurücksetzen“ (gedrückt halten).
- **Im Hub:** Rechtsklick auf das Orbitdeck-Symbol in der Taskleiste → „Alle Daten löschen“. Bei der Deinstallation wirst du dasselbe gefragt.
- **Kopplungen aufheben:** Tray-Menü → „Gekoppelte Widgets …“.
- **Update-Suche** ist standardmäßig aus.

---

## English

**In short:** Orbitdeck Edge has no servers, collects no data and does not connect to the internet. Everything runs on your PC.

### Who does Orbitdeck Edge talk to?

| Target | What for | When |
|---|---|---|
| iCUE (Sensors and Media plugin) | CPU/GPU load and temperature, the track that is playing, play/pause/skip | in the widget, also without the hub |
| Windows audio on your PC | volume, mute, microphone, output device; for the visualizer the sound is broken down **in memory** into 48 numbers (frequency bands) | hub only; visualizer only while the widget shows it |
| Windows shell | program list as in the Start menu, program icons, starting shortcuts | hub only, when you use shortcuts |
| Windows performance data | RAM in use and network speed (totals only, no connections or addresses) | hub only |
| The widget in iCUE, via `localhost:47822` | data between hub and widget | reachable from this PC only |
| `api.github.com` | check whether there is a new version | **only** if you switch on “Check for updates” |

Nothing else: no telemetry, no analytics, no crash reports, no ads, no tracking, no account. In iCUE the widget asks for a single permission: `localhost`, port 47822. Web page shortcuts open in your normal browser; Orbitdeck downloads nothing for them (not even favicons).

### What is stored?

| What | Where | How long |
|---|---|---|
| Options, tasks, focus sessions, history, timer | in the widget (iCUE storage) | until you choose “Reset all data” or remove the widget |
| The widget's pairing key | in the widget (iCUE storage) | until you remove the widget |
| Backup of tasks and history | `%APPDATA%\OrbitdeckEdge\backup-main.json` | until deleted/uninstalled |
| Shortcuts (name, program reference, folder or web address) | `%APPDATA%\OrbitdeckEdge\shortcuts.json` | until you remove them |
| Hub settings (update check, last started version) | `%APPDATA%\OrbitdeckEdge\settings.json` | until deleted/uninstalled |
| Paired widgets | `%APPDATA%\OrbitdeckEdge\pairings.json` – only a hash, never the key itself | until you unpair |
| Technical log | `%LOCALAPPDATA%\OrbitdeckEdge\logs\` – without tasks, titles or program names | 7 days at most |

**Never stored or sent anywhere:** sound, what you listen to, track names, sensor and network values. They exist in memory only and go only to the widget on this PC.

### Your control

- **In the widget:** Options → “Reset all data” (press and hold).
- **In the hub:** right-click the Orbitdeck icon in the taskbar → “Delete all data”. Uninstalling asks the same.
- **Unpair widgets:** tray menu → “Paired widgets …”.
- **Update check** is off by default.
