"""How far a card's page content is from its glass while the card moves, on a phone:
    python3 content-lag.py DIR --shots 16
The demo's `&content&slide` page has one flat red card travelling up and down on a spring, and on it an
element with a white rule 40 CSS px below the card's top edge, kept there by the engine. A screenshot taken
mid-flight shows both; the rule's distance from the edge, less those 40 px, is how far the content is off.
Reported as time along the card's known path: positive is content ahead of its glass, negative behind."""
import argparse, functools, http.server, io, json, re, statistics, subprocess, threading, time, urllib.request, uuid
from pathlib import Path
import websocket
from PIL import Image

ADB = str(Path.home() / "Library/Android/sdk/platform-tools/adb")
adb = lambda *c: subprocess.run([ADB, *c], capture_output=True, text=True, timeout=30).stdout.strip()
p = argparse.ArgumentParser()
p.add_argument("dir"); p.add_argument("--shots", type=int, default=16)
p.add_argument("--configs", nargs="*", default=["mode=worker", "mode=worker&contentLead=4", "mode=main"])
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
RULE = 80  # the rule's 40 CSS px below the edge, in device px at this phone's ratio of 2

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

def measure(image):
    """(card's top edge, how far the rule is from where it belongs), device px; None if either is not found."""
    px = image.load(); x = image.width // 2
    red = lambda y: px[x, y][0] > 180 and px[x, y][1] < 90 and px[x, y][2] < 90
    white = lambda y: min(px[x, y]) > 215
    top = next((y for y in range(120, image.height - 200) if red(y) and red(y + 6)), None)
    if top is None: return None
    rule = next((y for y in range(top + 8, min(top + 260, image.height - 1)) if white(y)), None)
    return None if rule is None else (top, rule - top - RULE)

try:
    for cfg in args.configs:
        call("Page.navigate", url=f"{origin}&{cfg}&content&slide&custom=flat&plain&scale=1.5&auto=1000&quiet")
        for _ in range(100):
            if js("!!window.__proof"): break
            time.sleep(.1)
        # The card moves once a second, by itself, and comes to rest in between. A finger resting on the page
        # keeps the display at its top rate (it idles at 60 Hz without touches); the page ignores it.
        taps = subprocess.Popen([ADB, "shell", f"input swipe {W // 2} {H - 400} {W // 2} {H - 300} {int((args.shots * .75 + 4) * 1000)}"], stdout=subprocess.DEVNULL)
        time.sleep(1.5); js("window.__proof.sample().then(() => 0)")
        seen = []
        for shot in range(args.shots):
            time.sleep(.05 + .07 * (shot % 7))  # spread the screenshots over the card's travel
            before = js("window.__next.isOpen()")
            found = measure(Image.open(io.BytesIO(subprocess.run([ADB, "exec-out", "screencap", "-p"], capture_output=True, timeout=30).stdout)).convert("RGB"))
            # Only shots with no tap during them: then the card was heading for the place the page says.
            if found and before == js("window.__next.isOpen()"): seen.append((*found, before))
        s = js("window.__proof.sample().then((s) => JSON.stringify(s))"); taps.kill(); glass = json.loads(s)["glass"] if s else {}
        if len(seen) < 4: print(json.dumps({"cfg": cfg, "shots": len(seen)}), flush=True); continue
        low, high = min(t for t, _, _ in seen), max(t for t, _, _ in seen)
        apart = []
        for top, off, opening in seen:
            # Progress of the glass and of the content towards where the card is heading, 0 to 1.
            glass_at = (top - low) / (high - low) if opening else (high - top) / (high - low)
            content_at = glass_at + (off if opening else -off) / (high - low)
            if 0.06 < glass_at < 0.9 and 0 < content_at < 0.98: apart.append(round(when(content_at) - when(glass_at), 1))
        print(json.dumps({"cfg": cfg, "thread": glass.get("thread"), "glassFps": glass.get("fps"), "shots": len(seen), "midFlight": len(apart),
                          "contentAheadMs": apart, "median": statistics.median(apart) if apart else None,
                          "worstAbs": max(map(abs, apart)) if apart else None, "travelPx": high - low}), flush=True)
finally:
    call("Page.close"); adb("reverse", "--remove", rev); adb("forward", "--remove", "tcp:" + port)
