"""Screenshots for README/SETUP in German and English (docs/images/<lang>/).

Needs: the widget served on 127.0.0.1:5521 (python -m http.server 5521 --bind 127.0.0.1 --directory widget),
a Debug hub started with --test-autopair --dev --autostart (own data folder, port 47823 – a real hub can keep
running) and `node tools/seed-shortcuts.mjs` run once.
Usage: python -I tools/docs_shots.py [de] [en]
"""
import os, subprocess, sys, time
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOT = os.path.join(ROOT, 'tools', 'shot.py')
DEMO = open(os.path.join(ROOT, 'tools', 'demo-data.js'), encoding='utf-8').read()
BASE = 'http://127.0.0.1:5521/'
CLEAN = "app.data.focus=null; app.data.timer=null; OrbitPanels.render();"
TMP = os.path.join(ROOT, 'artifacts', 'shots')

def shoot(name, lang, js, extra='', wait=5):
    out = os.path.join(TMP, f'{lang}-{name}.png')
    url = f'{BASE}?lang={lang}&demo&hub&hubport=47823{extra}'
    jsfile = os.path.join(TMP, f'{lang}-{name}.js')
    with open(jsfile, 'w', encoding='utf-8') as f: f.write(js)
    for attempt in range(3):  # the previous headless browser sometimes still holds the DevTools port
        r = subprocess.run([sys.executable, SHOT, url, out, '2536x696', str(wait), '@' + jsfile], capture_output=True)
        # a headless browser sometimes loses its GPU and draws a white page – take that one again
        if r.returncode == 0 and sum(Image.open(out).convert('L').resize((64, 16)).get_flattened_data()) / 1024 < 160: break
        time.sleep(3)
    else:
        sys.exit(f'shot failed: {name} ({lang}) ' + r.stderr.decode('utf-8', 'replace')[-800:])
    return out

def save(src, lang, name, width=1600):
    im = Image.open(src).convert('RGB')
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    path = os.path.join(ROOT, 'docs', 'images', lang, name + '.png')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)
    print('saved', os.path.relpath(path, ROOT))

def main():
    os.makedirs(TMP, exist_ok=True)
    for lang in (sys.argv[1:] or ['de', 'en']):
        save(shoot('hero', lang, CLEAN), lang, 'hero')
        save(shoot('focus', lang, DEMO), lang, 'home-focus')
        for panel in ('tasks', 'calendar', 'shortcuts', 'system', 'music', 'options'):
            js = DEMO + f"; openPanel('{panel}');"
            if panel in ('system', 'music', 'options'):
                js = DEMO + f"; app.data.focus=null; app.data.timer=null; OrbitPanels.render(); openPanel('{panel}');"
            save(shoot(panel, lang, js, wait=7), lang, 'p-' + panel)
        # all five scenes in one sheet (2 columns)
        tiles = [Image.open(shoot('scene-' + s, lang, CLEAN, f'&scene={s}')).convert('RGB') for s in ('ringworld', 'gasgiant', 'icemoon', 'redworld', 'nebula')]
        w, h = 1268, 348
        sheet = Image.new('RGB', (w * 2 + 12, h * 3 + 24), (8, 9, 12))
        for i, t in enumerate(tiles):
            sheet.paste(t.resize((w, h), Image.LANCZOS), ((i % 2) * (w + 12), (i // 2) * (h + 12)))
        sheet.save(os.path.join(TMP, f'{lang}-scenes.png'))
        save(os.path.join(TMP, f'{lang}-scenes.png'), lang, 'scenes')

if __name__ == '__main__':
    main()
