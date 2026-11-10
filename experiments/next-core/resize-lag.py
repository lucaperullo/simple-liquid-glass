"""How far a resizing card's page content is cut from where its glass ends, on a phone:
    python3 resize-lag.py DIR --shots 16
The demo's `&content&clip&grow` page has one flat red card growing from its corner and shrinking back on a
spring. Its content carries two white bands that run on past the card, cut off by the engine's window at the
card's right and bottom edges. A screenshot taken mid-flight shows where the glass ends and where the bands
do. Reported as time along the card's known path: positive is the content's cut ahead of the glass's edge."""
import argparse, functools, http.server, io, json, re, statistics, subprocess, threading, time, urllib.request, uuid
from pathlib import Path
import websocket
from PIL import Image

ADB = str(Path.home() / "Library/Android/sdk/platform-tools/adb")
adb = lambda *c: subprocess.run([ADB, *c], capture_output=True, text=True, timeout=30).stdout.strip()
p = argparse.ArgumentParser()
p.add_argument("dir"); p.add_argument("--shots", type=int, default=16)
p.add_argument("--keep", help="a folder to save the screenshots in")
p.add_argument("--configs", nargs="*", default=["mode=worker", "mode=main"])
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
# The card's spring (stiffness 170, damping 18), from 0 to 1: when it first reaches each point of its travel.
def _path():
    x = v = 0.0; out = []
    for step in range(480):
        v += ((1 - x) * 170 - v * 18) / 240; x += v / 240; out.append(x)
    return out
PATH = _path()
def when(progress):
    """ms after the card set off at which it is `progress` of the way (first passage)."""
    for step, x in enumerate(PATH):
        if x >= progress:
            before = PATH[step - 1] if step else 0.0
            return (step + (progress - before) / (x - before)) * 1000 / 240
    return None

def measure(image, ratio):
    """Device px: (glass's right edge, the band's end less it, glass's bottom edge, the band's end less it)."""
    px = image.load(); at = lambda css: round(css * ratio)
    red = lambda x, y: px[x, y][0] > 180 and px[x, y][1] < 90 and px[x, y][2] < 90
    white = lambda x, y: min(px[x, y]) > 215
    def run(test, along, start, limit):
        end = start
        while end < limit - 1 and test(*along(end + 1)): end += 1
        return end
    column = at(16 + 20)
    top = next((y for y in range(120, image.height - 200) if red(column, y) and red(column, y + 6)), None)
    if top is None: return None
    if not white(at(16 + 82), top + at(52)) or not white(at(16 + 52), top + at(82)): return None
    right = run(red, lambda x: (x, top + at(100)), at(16 + 82), image.width)
    band_right = run(white, lambda x: (x, top + at(52)), at(16 + 82), image.width)
    bottom = run(red, lambda y: (column, y), top + at(82), image.height)
    band_bottom = run(white, lambda y: (at(16 + 52), y), top + at(82), image.height)
    return right, band_right - right, bottom, band_bottom - bottom

def ahead(seen, edge, off):
    """ms the content's cut is ahead of the glass's edge, for each mid-flight shot; and what each was read from."""
    low, high = min(s[edge] for s in seen), max(s[edge] for s in seen)
    out = []; detail = []
    if high == low: return out, 0, detail
    for s in seen:
        opening = s[4]
        glass_at = (s[edge] - low) / (high - low) if opening else (high - s[edge]) / (high - low)
        content_at = glass_at + (s[off] if opening else -s[off]) / (high - low)
        if 0.06 < glass_at < 0.9 and 0 < content_at < 0.98:
            out.append(round(when(content_at) - when(glass_at), 1)); detail.append([int(opening), round(glass_at, 3), s[off]])
    return out, high - low, detail

try:
    for cfg in args.configs:
        call("Page.navigate", url=f"{origin}&{cfg}&content&clip&grow&custom=flat&plain&scale=1.5&auto=1000&quiet")
        for _ in range(100):
            if js("!!window.__proof"): break
            time.sleep(.1)
        ratio = js("devicePixelRatio")
        # A finger resting on the page keeps the display at its top rate; the page ignores it.
        taps = subprocess.Popen([ADB, "shell", f"input swipe {W // 2} {H - 400} {W // 2} {H - 300} {int((args.shots * .75 + 4) * 1000)}"], stdout=subprocess.DEVNULL)
        time.sleep(1.5); js("window.__proof.sample().then(() => 0)")
        seen = []
        for shot in range(args.shots):
            time.sleep(.05 + .07 * (shot % 7))
            before = js("window.__next.isOpen()")
            image = Image.open(io.BytesIO(subprocess.run([ADB, "exec-out", "screencap", "-p"], capture_output=True, timeout=30).stdout)).convert("RGB")
            if args.keep: image.save(Path(args.keep) / f"{cfg.replace('=', '-').replace('&', '_')}-{shot:03}.png")
            found = measure(image, ratio)
            if found and before == js("window.__next.isOpen()"): seen.append((*found, before))
        s = js("window.__proof.sample().then((s) => JSON.stringify(s))"); taps.kill(); glass = json.loads(s)["glass"] if s else {}
        if len(seen) < 4: print(json.dumps({"cfg": cfg, "shots": len(seen)}), flush=True); continue
        across, travel_x, how_x = ahead(seen, 0, 1); down, travel_y, how_y = ahead(seen, 2, 3)
        row = {"cfg": cfg, "thread": glass.get("thread"), "glassFps": glass.get("fps"), "shots": len(seen), "ratio": ratio}
        for name, values, travel, how in (("right", across, travel_x, how_x), ("bottom", down, travel_y, how_y)):
            row[name] = {"midFlight": len(values), "cutAheadMs": values, "median": statistics.median(values) if values else None,
                         "worstAbs": max(map(abs, values)) if values else None, "travelPx": travel,
                         "growing_progress_offPx": how}
        print(json.dumps(row), flush=True)
finally:
    call("Page.close"); adb("reverse", "--remove", rev); adb("forward", "--remove", "tcp:" + port)
