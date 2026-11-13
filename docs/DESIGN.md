# Orbitdeck Edge – Design-Entwurf

Stand: 2026-11-13 · Status: v1 freigegeben · Schritt 1 (Spike, `spike/ERGEBNISSE.md`) Schritt 2 (Widget-Grundgerüst) Schritt 3 (Panels ohne Hub), Schritt 4 (Hub), Schritt 5 (Hub im Widget) und Schritt 6 (Szenen) erledigt

Open-Source-Dashboard für die CORSAIR XENEON EDGE (XL waagerecht, 2536×696): eine live gezeichnete Weltraum-Szene mit Uhr und Musik-Visualizer, dazu Glas-Panels für Musik, Shortcuts, Aufgaben/Fokus, Kalender, System und Optionen. Angelehnt an das kommerzielle Widget „Cave Wonder Edge“ (Tom's Cave, Elgato Marketplace), aber **eigene Implementierung, eigene Gestaltung, eigene Szenen**. Kein Code, kein Branding und keine Bilder des Originals.

| Teil | Technik | Aufgabe |
|---|---|---|
| **Orbitdeck Edge Hub** | C# / .NET 8, WinForms-Tray-App | Visualizer-Daten, Musik-Infos und -Steuerung, Lautstärke/Geräte, Shortcuts starten, RAM/Netz, Sperren/Neustart/Herunterfahren. Lokaler WebSocket |
| **Orbitdeck Edge Widget** | iCUE-HTML-Widget (Widget API 1.9.0, iCUE 5.52), interaktiv | Szene, Uhr, alle Panels. Läuft auch **ohne Hub** (dann ohne die Hub-Funktionen) |

**Leitlinien** (wie bei Voicedeck/Mixdeck): 1. So einfach wie möglich (Installer, Kopplung per Klick, keine Ports eintippen). 2. Datenschutz: keine Server, keine Telemetrie, nur localhost.

---

## 1. Was ohne und was mit Hub geht

| Funktion | Ohne Hub | Mit Hub |
|---|---|---|
| Szene, Uhr, Datum, Wochentag | ✅ | ✅ |
| Aufgaben, Fokus-Sitzungen, Verlauf, Kalender, Timer, Kinomodus, Optionen | ✅ | ✅ |
| CPU/GPU Last + Temperatur (iCUE-Sensors-Plugin) | ✅ | ✅ |
| Musik: Titel/Interpret/Cover + Play/Pause/Skip (iCUE-Media-Plugin 1.1) | ✅ | ✅ |
| Musik-Visualizer | – (ruhige Ersatz-Animation) | ✅ echte Frequenzbänder |
| Lautstärke, Stumm, Mikro stumm, Lautsprecher/Kopfhörer | – | ✅ |
| Shortcuts (bis 12 Programme, Ordner, Webseiten) | – | ✅ |
| RAM, Netzwerk | – | ✅ |
| Sperren, Task-Manager, Neustart, Herunterfahren | – | ✅ |

## 2. Architektur

```
┌────────────────────────┐                      ┌───────────────────┐  ws://localhost:47822   ┌──────────────┐
│ Windows                │  Core Audio, WASAPI  │ Orbitdeck Edge Hub│ ◄─────────────────────► │ iCUE-Widget  │
│ Audio, Medien (GSMTC), │ ◄──────────────────► │ (Tray, 127.0.0.1) │  http://localhost:47822 │ Xeneon Edge  │
│ Leistung, Shell        │                      └───────────────────┘  /icon/<id>, /cover     └──────────────┘
└────────────────────────┘                                                        ▲ Sensors-/Media-Plugin
                                                                                  └── iCUE
```

- Server, Kopplung per Klick, Geräte-Token, `Origin`-Sperre, Log, Tray, Installer: **aus Mixdeck übernommen** (bewährt). Eigener Port **47822**, damit alle drei Hubs gleichzeitig laufen können.
- Hub schickt **Snapshot + Deltas**, Visualizer als eigener kompakter Strom.

### 2.1 Hub-Funktionen

- **Visualizer:** WASAPI-Loopback-Aufnahme des Standard-Ausgabegeräts (NAudio), FFT, 48 logarithmische Bänder, ~30 Pakete/s, bei Stille nichts. Das Widget braucht dafür **keine** Speaker-Berechtigung.
- **Musik:** Windows `GlobalSystemMediaTransportControls` (Spotify, Browser, Apple Music, …): Titel, Interpret, Album, Cover (als `/cover`), Spielt/Pausiert, Play/Pause/Weiter/Zurück.
- **Sound:** Master-Lautstärke + Stumm, Mikrofon stumm, Ausgabegerät wechseln (Code aus Mixdeck: NAudio + `IPolicyConfigVista`, Kommunikationsgerät bleibt).
- **Shortcuts:** bis zu 12 Einträge. Auswahl auf dem Bildschirm aus einer Liste, die der Hub liefert (Startmenü-Apps, angeheftete Ordner wie Downloads/Dokumente) oder Webseite per URL. Icons wie bei Mixdeck (128 px aus der Exe, Webseiten: Anfangsbuchstabe in Akzentfarbe, **kein** Favicon-Download – sonst Internetzugriff). Start nur über die gespeicherte Liste im Hub, nie mit beliebigen Pfaden aus dem Widget.
- **System:** RAM belegt/gesamt, Netzwerk ↓/↑ (Summe aller aktiven Adapter), 1×/s.
- **PC-Befehle:** Sperren, Task-Manager, Neustart, Herunterfahren. Im Widget Neustart/Herunterfahren nur mit 1,5 s gedrückt halten; Hub führt nur diese 4 festen Befehle aus.

### 2.2 Protokoll Widget ↔ Hub (Protokoll 1)

WebSocket `ws://localhost:47822/ws`, JSON, Nachrichten vom Hub mit `t`, vom Widget mit `op`. Kopplung, Token (`localStorage` unter `uniqueId`), Origin-Sperre und Icon-Schlüssel wie bei Mixdeck.

| Richtung | Nachricht | Inhalt |
|---|---|---|
| W → H | `hello {proto, token}` · `pair.request` | zuerst; ohne gültiges Token: `pair_pending` → `paired {token}` / `pair_denied` |
| H → W | `welcome {proto, hubVersion, iconBase, iconKey}` | Icons: `iconBase + <id>.png?k=iconKey` |
| H → W | `snapshot {audio, sys, shortcuts}` | `audio`: `devices[{id,name}]`, `device`, `canSwitch`, `master{volume,mute}`, `mic{volume,mute}`/null · `sys`: `ram{used,total}` (Bytes), `net{down,up}` (Bytes/s) · `shortcuts[{id,name,kind,icon}]` |
| H → W | `audio {data}` · `sys {data}` (1×/s, nur bei Änderung) · `shortcuts {list}` | Änderungen |
| H → W | `v {b:[48 × 0–100]}` | Visualizer-Bänder ~30/s, nur solange mindestens ein Widget `visualizer {on:true}` meldet und Ton läuft; bei Stille ein Null-Bild, dann nichts |
| W → H | `setVolume {target:"master"\|"mic", value 0–100}` · `setMute {target, mute}` · `setDevice {id}` | wie Mixdeck (Konsole + Multimedia, Kommunikationsgerät bleibt) |
| W → H | `visualizer {on}` | Hub nimmt nur auf, solange ein Widget es braucht |
| W → H | `listApps` → H → W `apps {list:[{ref,name,kind}]}` | Startmenü-Programme + bekannte Ordner (Downloads, Dokumente, Bilder, Musik, Videos, Desktop) zur Auswahl |
| W → H | `shortcuts.add {kind:"app"\|"folder", ref}` · `shortcuts.add {kind:"url", url, name}` · `shortcuts.remove {id}` · `shortcuts.move {id, to}` · `run {id}` | max. 12; `ref` muss aus `listApps` stammen; URLs nur `http(s)`; gestartet wird nur, was in der gespeicherten Liste steht |
| W → H | `power {action:"lock"\|"taskmgr"\|"restart"\|"shutdown"}` · `openIcue` | feste Befehle; Neustart/Herunterfahren im Widget nur per Halten |
| W → H | `sound {name:"alarm"\|"chime"}` | Hub spielt den Ton (Widget-Ton ist in iCUE stumm) |
| W → H | `backup.save {data}` (≤ 256 KB) · `backup.load` → H → W `backup {data}` | Sicherung von Aufgaben/Verlauf in `%APPDATA%\OrbitdeckEdge\backup-main.json` (eine pro Hub: ein neu importiertes Widget hat eine neue Kopplung und muss die alte Sicherung finden); das Widget lädt sie nur, wenn sein eigener Speicher leer ist |
| H → W | `error {code}` | `bad_json`, `not_paired`, `proto_mismatch`, `unknown_op`, `bad_value`, `bad_target`, `not_found`, `too_many`, `failed` |

## 3. Widget

### 3.1 Aufbau (XL waagerecht, 2536×696)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ◷ Fokus 0:42 · Aufgabe                                   Timer „Pizza“ 04:12 ⏰            │
│                                                                                          │
│                ·  *      ( Szene: Planet, Ringe, Gesteinsgürtel, Sternschnuppen )      ·  │
│                           DONNERSTAG · 13. NOVEMBER                                       │
│                                 21:47                                                    │
│                    ▁▃▅▇▆▄▂▁▂▄▆▇▅▃▁  Visualizer                                            │
│                    Titel – Interpret    ⏮ ⏯ ⏭                                            │
│      [Musik] [Shortcuts] [Aufgaben] [Kalender] [System] [Optionen]          [🎬]          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- Panels gleiten von unten als **Rauchglas** herein (Unschärfe + dunkle Tönung), höchstens eins gleichzeitig, schließen per Tippen daneben oder nach 30 s ohne Berührung.
- Alle Akzente (Knöpfe, Fortschritt, Markierungen) in der **iCUE-Akzentfarbe**.
- Layout und Stimmung **nah am Original** (Rückmeldung aus den Spike-Tests 0.0.2–0.0.4): großer gesperrter Wochentag, Datum, Uhr, Visualizer, Titel/Interpret, runde Steuerknöpfe, 6 runde Panel-Knöpfe mit Beschriftung, Fokus-Karte oben links. Schrift: Bahnschrift (in Windows enthalten, kein Download).

### 3.2 Szenen (eigene Gestaltung, live per WebGL gezeichnet)

| Szene | Inhalt |
|---|---|
| **Ringwelt** | Ringplanet mit Gesteinsgürtel aus Hunderten Brocken, Sternschnuppen, ab und zu ein Meteorschauer |
| **Gasriese** | Gestreifter Riese mit wirbelnden Bändern, Sturmauge, 3 Monde auf Bahnen |
| **Eismond** | Vereister Mond mit Rissen vor großem blauem Planeten am Rand, Polarlicht-Schimmer |
| **Nebel** | Langsam ziehender farbiger Nebel mit Sternhaufen, Komet zieht vorbei |

- **Texturen** (Entscheidung nach dem Spike): Solar System Scope, CC BY 4.0 (Nennung in CREDITS/README), als Daten-URLs eingebettet. Planetenkarten werden vorab kontrastverstärkt und umgefärbt (`tools/bake_planet.py`), Paket mit `tools/pack_textures.py`. WebGL2 + HDR + Bloom + Farbkorrektur; LDR-Ersatzweg ohne WebGL2.
- Monde kreisen auf geneigten Bahnen vor/hinter dem Planeten.
- Einstellungen: Szene, Drehung (1,5–10 Min. pro Umdrehung oder Stillstand), Brocken-Anzahl Voll/Weniger/Minimal, Szene in Akzentfarbe tönen ja/nein.
- Bildrate wählt Orbitdeck selbst (`iCUE.fpsLimit` ist nur ein Vorschlag, 60 fps gehen): Szene 30 fps, bei laufender Musik 60 fps; Option „Flüssigkeit“. Im Kinomodus und bei verdeckter Seite angehalten. Gemessen auf der Edge: 3,2 ms GPU (RTX 5080).

### 3.3 Panels

- **Musik:** Cover, Titel, Interpret, Fortschritt (wenn verfügbar), Steuerung, Lautstärke-Regler, Stumm, Mikro stumm, Ausgabegerät-Liste.
- **Shortcuts:** Raster 6×2. Langes Drücken = Bearbeiten-Modus (verschieben, entfernen, hinzufügen).
- **Aufgaben:** Aufgabe mit Datum, Dauer, Priorität (niedrig/mittel/hoch). Vorschläge aus früheren Aufgaben beim Tippen. Fokus-Sitzung starten → Zeit läuft oben links, Pausen-Erinnerung (Standard 50/10 Min.). Verlauf: erledigte Aufgaben und Sitzungen mit Arbeitszeit, FORTSETZEN.
- **Kalender:** Monatsansicht, Tage mit Aufgaben markiert, Tippen zeigt den Tag.
- **System:** CPU/GPU Last + Temperatur (Sensor-Automatik aus Specdeck übernommen), RAM, Netzwerk, PC-Befehle.
- **Optionen:** 12/24 h, Datum/Wochentag zeigen, Mikro-an-Erinnerung (Hinweis, wenn Mikro länger als X Min. offen ist – über Hub), Kinomodus-Helligkeit, „iCUE öffnen“ (über Hub), Alle Daten zurücksetzen.
- **Timer:** benannter Countdown oben rechts, Alarm (blinkender Rahmen; Ton über den Hub, weil Widget-Ton in iCUE stumm bleibt), Verschieben um 5 Min.
- **Kinomodus:** ein Tippen dimmt alles und hält die Szene an, Tippen irgendwo stellt wieder her.

### 3.4 Texteingabe

Für Aufgaben, Timer-Namen und Webseiten-Shortcuts braucht es Tippen. Die Edge zeigt keine Windows-Bildschirmtastatur für iCUE-Widgets (Spike bestätigt) → **eigene Bildschirmtastatur** im Widget (QWERTZ, Umlaute, Zahlenreihe).

### 3.5 Daten speichern

Aufgaben, Verlauf, Timer, Shortcut-Reihenfolge: `localStorage` je Widget-Instanz (`uniqueId`). Wenn der Hub verbunden ist, zusätzlich eine Sicherung im Hub (`%APPDATA%\OrbitdeckEdge\data.json`), damit beim Neu-Importieren nichts verloren geht.

### 3.6 Zustände

Hub nicht installiert / nicht gestartet / Kopplung ausstehend / verbunden / getrennt (letzte Werte grau + Hinweis). Hub-Kacheln zeigen ohne Hub einen kurzen Hinweis „Braucht Orbitdeck Hub“ mit Link zur Anleitung (über Link-Plugin im Systembrowser).

### 3.7 manifest.json und Berechtigungen

`supported_devices: [dashboard_lcd]`, `interactive: true`, `os: windows`, Plugins: Sensors 1.0, Media 1.1, Link 1.0.

| Typ | Umfang | Grund |
|---|---|---|
| `url` | `localhost`, Port `47822` | WebSocket + Icons/Cover vom Hub |

Sonst nichts – kein Internet, keine Dateien, kein Mikrofon, kein Speaker.

## 4. Datenschutz

Keine Verbindungen außer Loopback, keine Telemetrie, kein Konto. Gespeichert: Kopplungs-Tokens, Hub-Einstellungen, Shortcut-Liste, Sicherung der Aufgaben. „Alle Daten löschen“ im Tray und im Widget. Update-Suche opt-in.

## 5. Repo-Struktur

```
orbitdeck-edge/
  hub/  hub.Tests/  widget/  installer/  docs/  tools/  spike/
```

## 6. Umsetzungs-Reihenfolge

1. ✅ **Spike** (2026-11-13, auf der Edge): WebGL-Szene in iCUE flüssig bei 2536×696? Texteingabe/Tastatur auf der Edge. GSMTC + Loopback-FFT im Hub. Ergebnis in `spike/ERGEBNISSE.md`.
2. ✅ **Widget-Grundgerüst** (2026-11-13, `dist/OrbitdeckEdge-0.1.0.icuewidget`): Szene „Ringwelt“, Uhr (12/24 h, Wochentag/Datum ein/aus), Knopfleiste, Glas-Panels (eins zur Zeit, schließen per X, Tippen daneben oder nach 30 s), Kinomodus (Film-Knopf unten rechts, Helligkeit 0–35 %), Optionen-Panel (gespeichert je Widget unter `orbitdeck:<uniqueId>`, „Alle Daten zurücksetzen“ mit 1,5 s Halten), Platzhalter in den übrigen Panels, DE/EN.
   - iCUE-Einstellungen: Szene, Drehung (1,5/3/5/10 Min., Anhalten), Brocken (Voll/Weniger/Minimal = 2400/1200/400), Animation (Flüssig 60 / Sparsam 30 fps), Bildqualität (100/75/50 %), Lichtschein (Bloom), Szene in Akzentfarbe tönen; Personalisierung Text/Akzent/Hintergrund (tönt das Glas)/Transparenz – nur bei „Benutzerdefinierter Stil“ an.
   - Kleinere Slots als XL zeigen nur Szene + Uhr. Ohne WebGL: Standbild-Verlauf + Hinweis.
   - Keine Berechtigungen und keine Plugins in 0.1.0.
3. ✅ **Panels ohne Hub** (2026-11-13, `dist/OrbitdeckEdge-0.2.0.icuewidget`):
   - Datenmodell `scripts/model.js` (reine Logik, 10 Tests in `tests/model.test.js`): Aufgaben (Titel, Datum, Dauer 15–120 Min., Priorität), Fokus-Sitzungen mit Anhalten/Pause/Erinnerung (Standard nach 50 Min., 10 Min. Pause, einstellbar), Verlauf (max. 300 Sitzungen, erledigte Aufgaben 90 Tage), Timer. Alles unter `orbitdeck:<uniqueId>` gespeichert; laufende Fokus-Sitzung/Timer überstehen einen Neustart (absolute Zeitstempel).
   - Aufgaben-Panel mit Reitern Heute (inkl. überfällig) / Anstehend / Verlauf (mit Übersicht, FORTSETZEN) / Timer. Löschen per 0,8 s Halten.
   - Fokus-Karte oben links, Timer-Karte oben rechts (Tippen zeigt Knöpfe), Hinweis-Leiste über der Knopfleiste (bei offenem Panel ganz oben) für Pause/Pause vorbei/Timer-Alarm; Alarm = pulsierender Bildschirmrand (kein Ton ohne Hub).
   - Kalender: Monatsansicht mit Punkten (offen = Akzent, nur erledigt = grau), Tagesliste, „Aufgabe an diesem Tag“.
   - Bildschirmtastatur `scripts/keyboard.js` (QWERTZ/QWERTY, Umlaute, ?123, Vorschläge aus früheren Aufgaben, Großschreibung am Satzanfang).
   - System: CPU/GPU Last + Temperatur als Ringe, Sensor-Automatik aus Specdeck (`scripts/sensors.js`); RAM/Netz/PC-Befehle als Platzhalter „mit Hub“.
   - Musik: Media-Plugin 1.1 (Titel, Interpret, Album, Cover, Status) **mit Play/Pause/Weiter/Zurück** (geht ohne Hub); ruhiger Ersatz-Visualizer bis zum Hub.
   - manifest: `required_plugins` Sensors 1.0 + Media 1.1, weiter keine Berechtigungen.
   - Browser-Test: `?demo` (Beispiel-Musik/Sensoren) + `tools/demo-data.js`; `tests/i18n-keys.test.js` prüft alle Texte DE/EN.
4. ✅ **Hub** (2026-11-13): .NET-8-Tray-App `hub/` auf Basis des Mixdeck Hubs (Server, Kopplung, Origin-Sperre, Tray, Assistent, Log übernommen; Ducking/App-Fader entfernt), Port 47822, Protokoll 1 (2.2).
   - `Audio/AudioService` (Geräte, Master, Mikrofon, Gerätewechsel, eigener MTA-Thread), `Audio/Visualizer` (Loopback nur bei Bedarf, Front-L/R, FFT 2048/4096, 48 Bänder, Auto-Verstärkung; Stille → genau 0), `SystemInfo/SystemStats` (RAM, Netz nur über Adapter mit Gateway → VPN zählt nicht doppelt), `SystemInfo/PowerActions` (4 feste Befehle + iCUE öffnen, 3 s Sperre), `SystemInfo/Sounds` (erzeugte Töne alarm/chime), `Shortcuts/*` (Programmliste = Windows „Alle Apps“ inkl. Store-Apps über `shell:AppsFolder`, 128-px-Icons mit Transparenz über IShellItemImageFactory, max. 12, URLs nur http(s)), `Core/BackupStore` (≤ 256 KB je Widget).
   - Musik-Steuerung bleibt beim iCUE-Media-Plugin (kann Play/Pause/Skip selbst) – kein GSMTC im Hub nötig.
   - Testmodus `--test-autopair` (nur Debug): Kopplung ohne Frage, PC-Befehle/Shortcut-Starts nur geloggt, Töne stumm.
   - Tests: 51 Unit-Tests (`dotnet test hub.Tests`), Ende-zu-Ende `node tools/hub-probe.mjs` 34/34 (Lautstärke/Mikro werden sofort zurückgesetzt, Gerätewechsel nicht getestet). Gefunden + behoben: Nachrichtenlimit 64 KB < Sicherung 256 KB; Visualizer-Mindestverstärkung ließ Stille als 22 % erscheinen.
   - Noch nicht geprüft: Visualizer mit echter Musik im Hub (FFT-Rechnung aus dem Spike belegt), Gerätewechsel, echte PC-Befehle.
5. ✅ **Hub-Funktionen im Widget** (2026-11-13, Widget `dist/OrbitdeckEdge-0.3.0.icuewidget`, Hub `dist/hub-0.3.0/OrbitdeckEdgeHub.exe`):
   - `scripts/hub-client.js` (aus Mixdeck: Kopplung, Token, Wiederverbinden), `scripts/hub.js` (Zustand, Ereignisse, Sicherung, Wiederherstellen). Token unter eigenem Schlüssel `orbitdeck-token:<uniqueId>` – „Alle Daten zurücksetzen“ im Widget koppelt nicht ab.
   - Echter Visualizer (nur angefordert, solange Musikblock sichtbar), sonst Ersatz-Animation. Musik-Panel: Lautstärke-Regler, Stumm, Mikrofon, Ausgabegerät.
   - Shortcuts-Panel: 6×2-Raster, BEARBEITEN (verschieben/entfernen), Auswahl Programme (mit Suche) / Ordner / Webseite.
   - System-Panel: RAM, Netzwerk, Sperren, Task-Manager, Neustart/Herunterfahren (1,5 s halten).
   - Töne über den Hub: Timer-Alarm (alle 30 s, max. 5×), Gong bei Pause/Pause vorbei/Mikro. Mikro-Erinnerung (Aus/15/30/60 Min.).
   - Optionen: Hub-Status, „Erneut fragen“, „iCUE öffnen“.
   - Sicherung: eine pro Hub (`backup-main.json`) – getestet: Widget-Speicher komplett gelöscht → Aufgaben aus dem Hub zurück.
   - manifest: Berechtigung `url localhost:47822`. Eigenes Hub-Icon (Ringplanet). Hub-Version 0.3.0.
6. ✅ **Weitere Szenen** (2026-11-13, `dist/OrbitdeckEdge-0.4.0.icuewidget`): Ringwelt, **Gasriese** (Jupiter, 4 Monde, warmes Gegenlicht), **Eismond** (Eismond mit Rissen vorn links, Neptun riesig unten rechts, Polarlicht über dem Rand), **Rote Welt** (Mars, blaue Dämmerungskante, 2 kleine Monde), **Nebel** (kein Planet, verwirbelter Nebel mit Filamenten und Sternhaufen, alle 40–60 s ein Komet). `scene.js` ist jetzt ein Shader mit Konfiguration je Szene (`SCENES`); Planeten-Texturen werden erst bei Bedarf auf die GPU geladen. Neue Texturen: Jupiter, Neptun, Mars (Solar System Scope, CC BY 4.0). GPU-Zeit je Szene 1,2–1,6 ms (RTX 5080, XL). Browser-Test: `?scene=<name>`.
   - 0.4.1: Wochentag und Uhrzeit in **eigenen Linien-Glyphen** (`scripts/glyphs.js`, SVG-Striche, A–Z, Ä/Ö/Ü, 0–9) im Stil des Originals: dünn-geometrisch, „A“ ohne Querstrich, offenes „D“, kurzer linker „U“-Strich, eckig-runde Ziffern. Selbst gezeichnet statt Schrift-Download (keine passende freie Schrift, keine Lizenzfrage).
   - 0.4.2: nach Rückmeldung vom Edge-Test pixelgenau am Original nachgemessen (Original auf 2536×696 hochgerechnet): Buchstaben ≈ 0,8 Versalhöhen breit, Lücken ≈ 0,8, Wochentag-Versalhöhe ≈ 8,8 % der Höhe (Schriftgröße 7,8u, Strich 13, gerade Enden), Uhrzeit ≈ 6,9 % (6,4u, Strich 9, runde Enden), Datum 3,1u mit 0,26em Sperrung. Lehre: Vergleichsbilder immer maßstabsgleich erstellen.
7. **Installer, Assistent, README/SETUP/PRIVACY (DE/EN), GitHub-Release.**

Nach jedem Schritt: testen (Browser/Edge), kurz berichten, auf Freigabe warten.

## 7. Offene Punkte / Risiken

- **Name „Orbitdeck Edge“** – Verfügbarkeit noch nicht geprüft.
- **Leistung:** auf der Edge 3,2 ms GPU (RTX 5080). Schwächere GPUs: Auflösung 75/50 %, Brocken-Stufen, Bloom aus.
- **Wischen zwischen iCUE-Seiten** geht über interaktiven Widgets nicht (bekannte iCUE-Einschränkung aus Voicedeck) – Hinweis in SETUP.
- **Fortschritt des Titels:** GSMTC liefert die Position nicht bei jedem Player → dann ohne Fortschrittsbalken.
- Ton im Widget bleibt in iCUE stumm (auch mit `speaker`-Berechtigung) → ohne Hub nur optischer Alarm.
