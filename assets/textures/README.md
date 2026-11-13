# Textures

Source: [Solar System Scope](https://www.solarsystemscope.com/textures/), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), based on NASA imagery.

| File | Used for |
|---|---|
| `2k_saturn.jpg` → `planet_amber.jpg` | Ring World planet (contrast-boosted and recoloured by `tools/bake_planet.py`) |
| `2k_saturn_ring_alpha.png` | Ring World ring |
| `2k_jupiter.jpg`, `2k_neptune.jpg`, `2k_mars.jpg` | Gas Giant, Ice Moon, Red World |
| `2k_moon.jpg`, `2k_mercury.jpg`, `2k_ceres_fictional.jpg` | moons (Ceres map is partly fictional) |
| `2k_stars_milky_way.jpg` | Milky Way in the sky |

Rebuild the widget's embedded textures (`widget/scripts/textures.js`, data URLs because WebGL may refuse
`file://` images in iCUE):

```bash
python -I tools/bake_planet.py assets/textures/2k_saturn.jpg assets/textures/planet_amber.jpg
python -I tools/pack_textures.py assets/textures widget/scripts/textures.js
```
