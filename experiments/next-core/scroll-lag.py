"""How far behind the page the glass is while the page scrolls, on a phone: python3 scroll-lag.py DIR --runs 5
The demo's `&scroll` page has a ruler in the picture and glass that does not displace (`bend=0`). A finger drags
the page at a steady speed; a screenshot taken mid-drag shows the ruler beside the glass and through it. The
distance between the two is the lag, in device px, and divided by the drag's speed, in ms."""
import argparse, functools, http.server, io, json, re, statistics, subprocess, threading, time, urllib.request, uuid
from pathlib import Path
import websocket
from PIL import Image

ADB = str(Path.home() / "Library/Android/sdk/platform-tools/adb")
adb = lambda *c: subprocess.run([ADB, *c], capture_output=True, text=True, timeout=30).stdout.strip()
p = argparse.ArgumentParser()
p.add_argument("dir"); p.add_argument("--runs", type=int, default=5); p.add_argument("--speed", type=int, default=1400, help="device px per second")
p.add_argument("--fling", action="store_true", help="flick the page and measure while it coasts (px only: its speed is not known)")
p.add_argument("--configs", nargs="*", default=["mode=main", "mode=worker", "mode=worker&lead=8", "mode=worker&lead=16"])
args = p.parse_args()

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=args.dir))
threading.Thread(target=srv.serve_forever, daemon=True).start()
rev = f"tcp:{srv.server_port}"; adb("reverse", rev, rev); port = adb("forward", "tcp:0", "localabstract:chrome_devtools_remote")
tok = "lag" + uuid.uuid4().hex; origin = f"http://127.0.0.1:{srv.server_port}/?audit={tok}"
adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", origin, "--ez", "create_new_tab", "true", "com.android.chrome")
ws = None
for _ in range(100):
    try:
        for t in json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=4)):
            if tok in t["url"]: ws = websocket.create_connection(t["webSocketDebuggerUrl"], suppress_origin=True, timeout=60)
        if ws: break
    except Exception: pass
    time.sleep(.1)
seq = 0
def call(m, **k):
    global seq; seq += 1; ws.send(json.dumps(dict(id=seq, method=m, params=k)))
    while True:
        r = json.loads(ws.recv())
        if r.get("id") == seq: return r.get("result", r)
js = lambda e: call("Runtime.evaluate", expression=e, awaitPromise=True, returnByValue=True).get("result", {}).get("value")
W, H = map(int, re.search(r"(\d+)x(\d+)", adb("shell", "wm", "size")).groups())
PERIOD = 80  # the ruler's 40 CSS px, in device px at this phone's ratio of 2

def ruler(image, x, top, bottom):
    px = image.load(); light = lambda y: px[x, y][0] + px[x, y][1]
    return [y for y in range(top, bottom) if light(y) - max(light(y - 8), light(y + 8)) > 50 and light(y) >= light(y - 1) and light(y) > light(y + 1)]

def lag(image):
    """Device px the ruler seen through the glass is below the ruler beside it (the page moves up)."""
    beside, through = ruler(image, 5, 500, H - 400), ruler(image, W // 2, 500, H - 400)
    if len(beside) < 3 or len(through) < 3: return None
    offsets = [min(((t - b + PERIOD // 2) % PERIOD - PERIOD // 2 for b in beside), key=abs) for t in through]
    return statistics.median(offsets)

try:
    for cfg in args.configs:
        lags = []; errors = []; fps = []
        for run in range(args.runs):
            call("Page.navigate", url=f"{origin}&{cfg}&scale=1.5&scroll&bend=0&cards=1&auto=0&quiet&run={run}")
            for _ in range(100):
                if js("!!window.__proof"): break
                time.sleep(.1)
            time.sleep(.8); js("window.__proof.sample()")
            distance = int(H * .55); duration = distance / args.speed
            x = int(W * .7)  # not the screen's edge: a swipe that starts there is the system's back gesture
            if args.fling: distance = int(H * .3); duration = .12
            drag = subprocess.Popen([ADB, "shell", f"input swipe {x} {int(H * .8)} {x} {int(H * .8) - distance} {int(duration * 1000)}"], stdout=subprocess.DEVNULL)
            if args.fling: drag.wait(timeout=20); time.sleep(.1)  # the finger is up; the page coasts
            else: time.sleep(duration * .45 + .25)  # `input` takes about a quarter of a second to start
            shot = subprocess.run([ADB, "exec-out", "screencap", "-p"], capture_output=True, timeout=30).stdout
            drag.wait(timeout=20); time.sleep(2 if args.fling else .3)
            s = js("window.__proof.sample()"); measured = lag(Image.open(io.BytesIO(shot)).convert("RGB"))
            if measured is not None: lags.append(measured)
            errors.append(s["glass"].get("scrollError")); fps.append(s["glass"].get("fps"))
        print(json.dumps({"cfg": cfg, "scroll": "fling" if args.fling else f"drag at {args.speed} px/s", "lagPx": lags,
                          "lagMs": None if args.fling else [round(1000 * l / args.speed, 1) for l in lags],
                          "glassFps": fps, "predictionErrorCssPx": errors,
                          "displayHz": (re.search(r"activeMode=([\d.]+)", adb("shell", "dumpsys SurfaceFlinger | grep -m1 activeMode=")) or [None, None])[1]}), flush=True)
finally:
    call("Page.close"); adb("reverse", "--remove", rev); adb("forward", "--remove", "tcp:" + port)
