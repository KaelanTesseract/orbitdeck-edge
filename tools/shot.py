"""Screenshot + console log of a page with headless Edge (DevTools protocol).
Usage: python tools/shot.py <url> <out.png> [WxH] [wait_s] [js-to-run-before-shot]
"""
import asyncio, base64, json, subprocess, sys, tempfile, time, urllib.request
import websockets

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
DBG = 9334

async def main(url, out, w, h, wait, js):
    req = urllib.request.Request(f"http://127.0.0.1:{DBG}/json/new?about:blank", method="PUT")
    info = json.loads(urllib.request.urlopen(req).read())
    async with websockets.connect(info["webSocketDebuggerUrl"], max_size=2**28) as ws:
        i = 0; logs = []
        async def call(method, **params):
            nonlocal i
            i += 1; my = i
            await ws.send(json.dumps({"id": my, "method": method, "params": params}))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get("method") == "Runtime.consoleAPICalled":
                    logs.append(" ".join(str(a.get("value", a.get("description", ""))) for a in msg["params"]["args"]))
                if msg.get("method") == "Runtime.exceptionThrown":
                    logs.append("EXC " + json.dumps(msg["params"]["exceptionDetails"])[:500])
                if msg.get("id") == my:
                    return msg.get("result", {})
        await call("Runtime.enable")
        await call("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=1, mobile=False)
        await call("Page.navigate", url=url)
        end = time.time() + wait
        while time.time() < end:
            await call("Runtime.evaluate", expression="1")
            await asyncio.sleep(0.25)
        if js:
            await call("Runtime.evaluate", expression=js)
            await asyncio.sleep(1.0)
            await call("Runtime.evaluate", expression="1")
        shot = await call("Page.captureScreenshot", format="png")
        open(out, "wb").write(base64.b64decode(shot["data"]))
        for l in logs: print("LOG", l)

url, out = sys.argv[1], sys.argv[2]
w, h = map(int, (sys.argv[3] if len(sys.argv) > 3 else "2536x696").split("x"))
wait = float(sys.argv[4]) if len(sys.argv) > 4 else 3
js = sys.argv[5] if len(sys.argv) > 5 else ""
if js.startswith("@"):  # long or non-ASCII scripts come from a file (Windows command lines mangle them)
    js = open(js[1:], encoding="utf-8").read()
prof = tempfile.mkdtemp()
p = subprocess.Popen([EDGE, "--headless=new", f"--remote-debugging-port={DBG}", f"--user-data-dir={prof}", "--enable-unsafe-swiftshader",
                      "--no-first-run", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try: urllib.request.urlopen(f"http://127.0.0.1:{DBG}/json/version"); break
        except Exception: time.sleep(0.2)
    asyncio.run(main(url, out, w, h, wait, js))
finally:
    p.kill()
