# Spike – Ergebnisse

Stand: 2026-11-13 · **Spike abgeschlossen** (Hub-Teil + Widget 0.0.4 auf der Edge abgenommen)

## 1. Hub (`spike/HubSpike`, .NET 8, `net8.0-windows10.0.19041.0`)

Start: `dotnet run -- [--long] [--dev=loudest|<Name>] [--control]` (ohne `--control` nur lesend).

### Musik (GSMTC) ✅
- Manager in 29 ms. Chrome (YouTube) liefert Titel, Interpret, Status, Position/Länge und ein Cover (27 KB).
- Chrome meldet Weiter/Zurück als **nicht verfügbar** → Knöpfe je nach `Controls.Is…Enabled` ausgrauen.
- Album ist bei YouTube leer.
- Play/Pause (`--control`) noch nicht ausprobiert, um laufende Wiedergabe nicht zu stören.

### Visualizer (WASAPI-Loopback + FFT) ✅
- Standardgerät hier: „SteelSeries Sonar – Gaming“, **96 kHz, 8 Kanäle, Float**. Chrome läuft auf diesem Gerät.
- Fehler 1: Mittelwert über alle 8 Kanäle drückt Stereo auf 1/4 → nur **vorne links/rechts** verwenden.
- Fehler 2: NAudio-FFT teilt durch N → Betrag × 4 (einseitig, Hann), dann dB.
- Mit **automatischer Verstärkung** (folgt dem lautesten Band, fällt langsam ab) sind auch leise Videos gut sichtbar.
- Aufwand: 0,05 ms je Bild für FFT + 48 Bänder, ~30 Bilder/s, **0,01 % CPU**.
- Bei 96 kHz und N = 2048 sind die Frequenzschritte 47 Hz breit → die untersten Bänder teilen sich dieselben FFT-Werte (sieht treppig aus). Lösung im Hub: N = 8192 bei ≥ 88 kHz oder untere Bänder interpolieren.
- Core-Audio-Objekte nur auf **einem MTA-Thread** ohne `await` dazwischen (sonst `E_NOINTERFACE`), wie bei Mixdeck.
- Offen: Sonar legt Apps auf verschiedene virtuelle Geräte (Gaming, Chat, Media …). Für den Visualizer reicht das Standardgerät meistens; besser im Hub: das lauteste aktive Ausgabegerät nehmen oder mehrere Geräte zusammenmischen.

### RAM / Netz ✅
- RAM über `GlobalMemoryStatusEx` (37,8 / 61,6 GB).
- Netz über `NetworkInterface`-Zähler. **Achtung VPN:** NordLynx und Ethernet zählen denselben Verkehr doppelt → im Hub nur Adapter mit Standard-Gateway zählen bzw. Tunnel-Adapter bevorzugen und physischen dann weglassen. Hyper-V/WSL-Adapter ausfiltern.

## 2. Widget (`spike/widget`, Paket `dist/OrbitdeckSpike-0.0.1.icuewidget`)

Szene „Ringwelt“ in WebGL 1: ein Vollbild-Shader (Sterne, Nebel, Planet mit prozeduralen Bändern, Ring mit Schatten in beide Richtungen, Halo, Sternschnuppen) + Brocken als Punkte (Kepler-Umlauf, Verdeckung und Schatten durch den Planeten).

Auf dem Entwickler-PC (headless Edge, RTX 5080, 2536×696, 100 %, 600 Brocken): **0,9 ms GPU-Zeit, 120 fps** (vom Monitor begrenzt).

Knöpfe auf dem Bildschirm: Brocken (0–2400), Auflösung (100/75/50 %), Glas-Panel (`backdrop-filter: blur(24px)` über WebGL), Eingabe-Test, Ton-Test, **Messreihe** (18 Kombinationen à 4 s, Tabelle auf dem Bildschirm + `Orbitdeck spike: bench …` im iCUE-Log).

### Edge-Test 0.0.1 (2026-11-13)
- Import ok, Szene läuft. **iCUE meldet `fpsLimit` 10** (Doku: Standard 30) → alles läuft mit 10 fps.
- Messreihe: GPU-Zeit **1,1–1,9 ms in allen 18 Kombinationen** (Auflösung, 0–2400 Brocken, Glas-Unschärfe) → Leistung ist kein Thema, Grenze ist nur das FPS-Limit.
- Eingabe: **keine Windows-Bildschirmtastatur** → eigene Tastatur im Widget (wie geplant).
- Ton: WebAudio meldet „running“, aber **nichts hörbar** (ohne `speaker`-Berechtigung). `<audio>`-Test scheiterte an einem Fehler im Test-WAV (Länge keine ganze Zahl) – behoben in 0.0.2.
- Rückmeldung Design: **weicht zu stark vom Original ab** → 0.0.2 näher am Original (Komposition, Licht, Layout), weiterhin eigener Code ohne Bilder des Originals.

### 0.0.2 (Paket `dist/OrbitdeckSpike-0.0.2.icuewidget`)
- Szene: flacher, breiter Goldring über die ganze Breite, Gegenlicht von links mit Blendung am Planetenrand, 5 Monde, dichter Brocken-Gürtel (2400), warme Farben.
- Layout: großer gesperrter Wochentag, Datum, Uhr, Demo-Visualizer (64 Balken), Titel/Interpret, runde Steuerknöpfe, 6 runde Panel-Knöpfe mit Beschriftung, Fokus-Karte oben links. Schrift: Bahnschrift (in Windows enthalten).
- Testwerkzeuge hinter „TEST“ oben rechts. Neu: „FPS-Limit“ (ignoriert `iCUE.fpsLimit`, um zu sehen, ob iCUE selbst drosselt), Ton-Test mit `speaker`-Berechtigung.

### Edge-Test 0.0.2 (2026-11-13)
- **FPS-Limit ignoriert → 60 fps** bei 2,9 ms GPU. `iCUE.fpsLimit` ist nur ein Vorschlag; iCUE drosselt nicht selbst. → Orbitdeck wählt die Bildrate selbst (Szene z. B. 30, Visualizer flüssig).
- Ton: WebAudio „running“, `<audio>` „ok“ – trotzdem **nichts hörbar**, auch mit `speaker`-Berechtigung. → Timer-/Erinnerungstöne spielt der Hub.
- Design: besser, aber „Original deutlich stimmungsvoller und realistischer“. Entscheidung: echte Planeten-Texturen.

### 0.0.3 (Paket `dist/OrbitdeckSpike-0.0.3.icuewidget`, 0,9 MB)
- Texturen von Solar System Scope (CC BY 4.0): Saturn, Saturn-Ring, Mond, Merkur, Ceres (fiktiv), Milchstraße. Verkleinert und als Daten-URLs in `scripts/textures.js` (WebGL könnte `file://`-Bilder in iCUE ablehnen). Nennung in `CREDITS.txt`. Originale in `assets/textures/`.
- WebGL2 mit HDR-Zwischenbild (RGBA16F), Bloom (Hell-Filter 1/4 + breiterer Schein 1/8), Tonemapping, Farbkorrektur (kühle Schatten, warme Lichter), Vignette, Körnung. Ohne WebGL2/HDR: LDR-Ersatzweg.
- Ring-Textur breiter gestreckt (1,3–3,0 Planetenradien) als bei echtem Saturn, wegen des Looks.
- Stolperfalle: Bloom-Schwelle zu niedrig → beleuchtete Planetenhälfte strahlt über den ganzen Planeten. Schwelle 1,8 (HDR).
- Entwickler-PC: 2,8 ms GPU bei 60 fps (XL, 2400 Brocken, Bloom an). Neuer Test-Knopf „Bloom“.

### Edge-Test 0.0.3 (2026-11-13)
- Texturen laden als Daten-URLs in iCUE ✅, WebGL2 ✅, HDR ✅, **59 fps bei 3,2 ms GPU** (XL, Bloom an).
- Rückmeldung: Monde bewegen sich nicht; Planetentextur kommt nicht so durch wie im Original.

### 0.0.4 (Paket `dist/OrbitdeckSpike-0.0.4.icuewidget`)
- Planet: Saturn-Karte hat kaum Kontrast (Detail-Schwankung ~1 %). `tools/bake_planet.py` verstärkt Bänder (×4,5) und Details, verwellt Bandgrenzen mit nahtlosem Rauschen und färbt in eine Bernstein-Palette. Shader nutzt die Karte direkt.
- Monde kreisen auf geneigten Ellipsen um den Planeten (75–320 s pro Umlauf); vorne vor Planet/Ring, hinten vom Planeten verdeckt, vorne etwas größer.
- `tools/pack_textures.py` erzeugt `scripts/textures.js` reproduzierbar.

### Edge-Test 0.0.4 (2026-11-13): „passt“ ✅

## 3. Entscheidungen für die Umsetzung
- Szene: WebGL2 + HDR-Bloom, Texturen (Solar System Scope, CC BY 4.0) als Daten-URLs, Planetenkarte gebacken (`tools/bake_planet.py`), kreisende Monde. Fallback ohne WebGL2/HDR: LDR-Weg.
- Bildrate wählt Orbitdeck selbst (`iCUE.fpsLimit` nur Vorschlag): Szene 30 fps, bei laufender Musik 60 fps für den Visualizer; Einstellung in den Optionen.
- Töne (Timer, Pausen-Erinnerung, Mikro-Hinweis) spielt der Hub – Widget-Ton ist in iCUE stumm.
- Eigene Bildschirmtastatur (Windows zeigt keine).
- Layout wie Spike 0.0.2/0.0.4: Wochentag groß gesperrt, Datum, Uhr, Visualizer, Titel, runde Steuerknöpfe, 6 runde Panel-Knöpfe, Fokus-Karte oben links. Schrift Bahnschrift (Windows).
- Visualizer im Hub: lautestes aktives Ausgabegerät, nur Front-L/R, FFT × 4, Auto-Verstärkung, größeres N bei 96 kHz.
