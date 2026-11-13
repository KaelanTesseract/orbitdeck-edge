# Development

Design, protocol and decisions: [DESIGN.md](DESIGN.md) (German). Results of the rendering spike: [../spike/ERGEBNISSE.md](../spike/ERGEBNISSE.md).

## Layout

| Folder | What |
|---|---|
| `widget/` | iCUE widget (Widget API 1.9.0, XL horizontal). `scripts/scene.js` WebGL2 scene (HDR + bloom, one shader configured per scene in `SCENES`), `app.js` boot, options, clock, panels; `glyphs.js` the line lettering of the clock; `model.js` tasks/focus/timer; `panels.js`, `music.js`, `shortcuts.js`, `system.js` the panels; `hub.js` + `hub-client.js` the hub connection; `keyboard.js` on-screen keyboard |
| `hub/` | .NET 8 WinForms tray app: audio + visualizer (`Audio/`, NAudio), system stats, PC commands and sounds (`SystemInfo/`), shortcuts (`Shortcuts/`), backup (`Core/`), local server (`Server/`), tray + setup assistant (`Tray/`) |
| `hub.Tests/` | xUnit tests (protocol, security, settings, shortcuts, backup) |
| `tests/` | Node tests for the widget's task model and translation keys |
| `assets/textures/` | source planet textures (Solar System Scope, CC BY 4.0) – packed into `widget/scripts/textures.js` |
| `installer/` | Inno Setup script (per user, no admin rights) |
| `tools/` | screenshots, end-to-end probe, texture packing |
| `spike/` | the rendering spike (kept for reference) |

## Build and test

```bash
dotnet test hub.Tests
node --test tests/model.test.js tests/i18n-keys.test.js
icuewidget validate widget
```

Release build (one self-contained `.exe`), widget package and installer:

```bash
dotnet publish hub -c Release -o artifacts/hub
icuewidget package widget -o artifacts/OrbitdeckEdge.icuewidget
iscc /DAppVersion=0.9.0 installer/OrbitdeckEdge.iss
```

Textures changed? `python tools/pack_textures.py` rewrites `widget/scripts/textures.js` (embedded as data URLs, because WebGL may refuse `file://` images inside iCUE).

Releases: push a tag `vX.Y.Z` – the release workflow builds everything and creates a **draft** release. Hub (`.csproj`), widget (`manifest.json`) and the tag must carry the same version.

## Trying things out

- **Widget in a browser:** serve `widget/` (`python -m http.server 5521 --bind 127.0.0.1 --directory widget`).
  `?demo` shows sample music and sensors; also `&scene=gasgiant|icemoon|redworld|nebula`, `&lang=en`.
  Without `?demo` it connects to a hub started with `--dev` (accepts `http://localhost` pages).
- **Test hub next to a real one:** a Debug build started with `--test-autopair` pairs without asking, uses its own
  data folder (`%TEMP%\OrbitdeckEdge-test`) and port 47823, only logs PC commands and shortcut starts, and plays no sounds.
  `?demo&hub&hubport=47823` connects the browser widget to it.
- **End-to-end:** `node tools/hub-probe.mjs` against the test hub (protocol, audio, visualizer, shortcuts, power, backup, limits – reverts everything it changes).
- **Screenshots for the docs:** `node tools/seed-shortcuts.mjs`, then `python -I tools/docs_shots.py [de] [en]` (needs Microsoft Edge);
  assistant: `OrbitdeckEdgeHub.exe --render-wizard docs/images/de de` (Debug build).

## Things that bit us

- `iCUE.fpsLimit` is only a hint – the widget renders at the display rate; *Power Saver* lowers it on purpose.
- Point sprites cannot be hidden with `gl_PointSize = 0` (ANGLE clamps to 1 px) – move them out of clip space.
- Widgets cannot play sound and Windows shows no touch keyboard on the Edge – the hub plays the sounds, the widget has its own keyboard.
- The iCUE Media plugin can play/pause/skip itself, so the hub needs no media-session code.
- WASAPI loopback: use the front left/right channels only, or surround mixes look wrong.
- Programs started from the Claude desktop app see a redirected `%APPDATA%`.
