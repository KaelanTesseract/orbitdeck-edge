# Third-party notices

## NAudio (NAudio.Core, NAudio.Wasapi 2.2.1)

The hub uses NAudio to talk to Windows Core Audio (devices, volumes, microphone, loopback capture for the visualizer).
https://github.com/naudio/NAudio

```
MIT License

Copyright (c) Mark Heath 2023

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Microsoft .NET

The installed hub is a self-contained .NET 8 application and includes the .NET runtime
(MIT License, Copyright (c) .NET Foundation and Contributors) – https://github.com/dotnet/runtime

## Inno Setup

The installer is built with Inno Setup (Copyright (C) 1997-2026 Jordan Russell, Martijn Laan) –
https://jrsoftware.org/isinfo.php

## Planet, moon, ring and Milky Way textures

Solar System Scope – https://www.solarsystemscope.com/textures/
Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0) – https://creativecommons.org/licenses/by/4.0/
Based on NASA elevation and imagery data.

Changes made by Orbitdeck Edge: resized and recompressed; the Saturn map is contrast-boosted and recoloured
(`tools/bake_planet.py`); all maps are colour-graded and lit in a WebGL shader. Sources: `assets/textures/`.

## Sensor selection

The automatic choice of CPU/GPU sensors (`widget/scripts/sensors.js`) is taken over from
[Specdeck Edge](https://github.com/KaelanTesseract/specdeck-edge) (MIT, same author).
