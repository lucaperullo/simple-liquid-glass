"""The bench page on a phone: cadence of glass drawn on the page thread vs in a worker, and what reaches the screen.
    python3 phone.py DIR --runs 3 > rows.jsonl      (configs are run round-robin to spread thermal drift)"""
import argparse, functools, http.server, json, re, subprocess, sys, threading, time, urllib.request, uuid
from pathlib import Path
import websocket
ADB = str(Path.home() / "Library/Android/sdk/platform-tools/adb")
adb = lambda *c: subprocess.run([ADB, *c], capture_output=True, text=True, timeout=30).stdout.strip()
p = argparse.ArgumentParser(); p.add_argument("dir"); p.add_argument("--runs", type=int, default=3); p.add_argument("--seconds", type=float, default=6)
p.add_argument("--configs", nargs="*"); args = p.parse_args()
CONFIGS = args.configs or [
    "mode=main&present=direct&scale=1.5&shader=fd", "mode=worker&present=direct&scale=1&shader=fd", "mode=worker&present=direct&scale=1.5&shader=fd",
    "mode=worker&present=direct&scale=2&shader=fd", "mode=worker&present=direct&scale=1.5&shader=analytic", "mode=worker&present=direct&scale=2&shader=analytic",
    "mode=worker&present=bitmap&scale=1.5&shader=fd", "mode=worker&present=direct&scale=1.5&shader=fd&views=6", "mode=worker&present=bitmap&scale=1.5&shader=fd&views=6",
]
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Q, directory=args.dir)); threading.Thread(target=srv.serve_forever, daemon=True).start()
rev = f"tcp:{srv.server_port}"; adb("reverse", rev, rev); port = adb("forward", "tcp:0", "localabstract:chrome_devtools_remote")
tok = "proof" + uuid.uuid4().hex; origin = f"http://127.0.0.1:{srv.server_port}/?audit={tok}"
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
def presented():
    best = None
    for l in [l for l in adb("shell", "dumpsys SurfaceFlinger --list").splitlines() if "ChromeChildSurface" in l]:
        ts = sorted({int(c[1]) for c in (x.split() for x in adb("shell", f"dumpsys SurfaceFlinger --latency '{l}'").splitlines()) if len(c) == 3 and c[1].isdigit() and 0 < int(c[1]) < 2**62})
        iv = sorted((b - a) / 1e6 for a, b in zip(ts, ts[1:]))
        # Chrome can leave an old surface behind with its last frames still listed: the live one is the newest.
        if len(iv) > 30 and (best is None or ts[-1] > best[0]): best = (ts[-1], round(1000 * len(iv) / sum(iv), 1), round(iv[len(iv) // 2], 1), round(iv[int(len(iv) * .95)], 1))
    return best and {"fps": best[1], "p50": best[2], "p95": best[3]}
try:
    for run in range(args.runs):
        for cfg in CONFIGS:
            call("Page.navigate", url=f"{origin}&{cfg}&auto=700&quiet&run={run}")
            for _ in range(100):
                if js("!!window.__proof"): break
                time.sleep(.1)
            touch = f"input swipe {W-12} {int(H*.3)} {W-12} {int(H*.8)} {int((args.seconds + 3.2) * 1000)}" if "hold" in cfg else "; ".join([f"input tap {W//2} {int(H*.5)}; sleep 0.35"] * 30)
            taps = subprocess.Popen([ADB, "shell", touch], stdout=subprocess.DEVNULL)
            time.sleep(2.5); js("window.__proof.sample()"); time.sleep(args.seconds)
            s = js("window.__proof.sample()"); shown = presented()
            hz = re.search(r"activeMode=([\d.]+)", adb("shell", "dumpsys SurfaceFlinger | grep -m1 activeMode="))
            if 'hold' in cfg: taps.wait(timeout=20); time.sleep(0.5)
            taps.kill()
            print(json.dumps({"cfg": cfg, "run": run, "glass": s and s["glass"], "page": s and s["page"], "presented": shown, "displayHz": hz and hz.group(1),
                              "px": js("window.__proof.config.px"),
                              "temp": int(re.search(r"temperature: (\d+)", adb("shell", "dumpsys battery")).group(1)) / 10}), flush=True)
finally:
    call("Page.close"); adb("reverse", "--remove", rev); adb("forward", "--remove", "tcp:" + port)
