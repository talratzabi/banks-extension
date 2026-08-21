# -*- coding: utf-8 -*-
"""לקוח CDP מינימלי — העיניים של הסוכן על Chrome הייעודי.
דורש: pip install websocket-client   ו-Chrome שהופעל ע"י tools/chrome-debug.cmd
שימוש:
  python tools/cdp.py targets
  python tools/cdp.py eval <חלק-מכתובת> "<js>"
  python tools/cdp.py storage
  python tools/cdp.py console <חלק-מכתובת> [שניות]
  python tools/cdp.py open <url>
  python tools/cdp.py nav <חלק-מכתובת> <url>
  python tools/cdp.py dom <חלק-מכתובת> [selector] [--out קובץ]
"""
import json, sys, time, urllib.request
try:
    sys.stdout.reconfigure(encoding='utf-8');sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass
from websocket import create_connection

PORT = 9222
BASE = "http://127.0.0.1:%d" % PORT


def http_json(path):
    with urllib.request.urlopen(BASE + path, timeout=5) as r:
        return json.loads(r.read().decode("utf-8"))


class CDP:
    """מתחבר ל-browser target ומדבר עם כל שאר היעדים ב-flat sessions."""

    def __init__(self):
        try:
            ws_url = http_json("/json/version")["webSocketDebuggerUrl"]
        except Exception as e:
            sys.exit("אין חיבור לפורט %d — האם Chrome הודלק עם tools/chrome-debug.cmd? (%s)" % (PORT, e))
        self.ws = create_connection(ws_url, timeout=30, suppress_origin=True)
        self._id = 0
        self.events = []

    def send(self, method, session=None, **params):
        self._id += 1
        msg = {"id": self._id, "method": method, "params": params}
        if session:
            msg["sessionId"] = session
        self.ws.send(json.dumps(msg))
        while True:
            got = json.loads(self.ws.recv())
            if got.get("id") == self._id:
                if "error" in got:
                    raise RuntimeError("%s: %s" % (method, got["error"]))
                return got.get("result", {})
            self.events.append(got)

    def targets(self):
        return [t for t in self.send("Target.getTargets")["targetInfos"]
                if t["type"] in ("page", "service_worker", "background_page", "iframe")]

    def pick(self, match):
        cands = [t for t in self.targets()
                 if match.lower() in (t.get("url", "") + " " + t.get("title", "")).lower()]
        if not cands:
            sys.exit("לא נמצא יעד שמכיל %r. הרץ targets כדי לראות מה פתוח." % match)
        cands.sort(key=lambda t: 0 if t["type"] == "page" else 1)
        return cands[0]

    def attach(self, target):
        return self.send("Target.attachToTarget", targetId=target["targetId"], flatten=True)["sessionId"]

    def eval(self, session, expr, await_promise=True):
        r = self.send("Runtime.evaluate", session=session, expression=expr,
                      returnByValue=True, awaitPromise=await_promise, userGesture=True)
        if r.get("exceptionDetails"):
            d = r["exceptionDetails"]
            return {"__error__": d.get("exception", {}).get("description") or d.get("text")}
        return r.get("result", {}).get("value")

    def drain(self, seconds):
        end = time.time() + seconds
        self.ws.settimeout(1.0)
        while time.time() < end:
            try:
                self.events.append(json.loads(self.ws.recv()))
            except Exception:
                pass
        self.ws.settimeout(30)


def out(x):
    print(json.dumps(x, ensure_ascii=False, indent=2, default=str))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd, args = sys.argv[1], sys.argv[2:]
    c = CDP()

    if cmd == "targets":
        out([{"type": t["type"], "title": t.get("title", "")[:60], "url": t.get("url", "")[:110]}
             for t in c.targets()])

    elif cmd == "eval":
        t = c.pick(args[0])
        expr = args[1]
        if expr.startswith("@"):
            expr = open(expr[1:], encoding="utf-8").read()
        print("// יעד: %s %s" % (t["type"], t.get("url", "")[:90]), file=sys.stderr)
        out(c.eval(c.attach(t), expr))

    elif cmd == "storage":
        sw = [t for t in c.targets()
              if t["type"] in ("service_worker", "background_page") and "chrome-extension" in t.get("url", "")]
        if not sw:
            sys.exit("ה-service worker של התוסף אינו פעיל. פתח את הדשבורד או לחץ ⟳ בתוסף.")
        print("// %s" % sw[0]["url"], file=sys.stderr)
        keys = args[0].split(",") if args else None
        expr = "chrome.storage.local.get(%s)" % (json.dumps(keys) if keys else "null")
        out(c.eval(c.attach(sw[0]), expr))

    elif cmd == "console":
        t = c.pick(args[0])
        secs = float(args[1]) if len(args) > 1 else 15
        s = c.attach(t)
        c.send("Runtime.enable", session=s)
        c.send("Log.enable", session=s)
        print("// מאזין %ss ל-%s" % (secs, t.get("url", "")[:80]), file=sys.stderr)
        c.drain(secs)
        rows = []
        for e in c.events:
            m = e.get("method")
            p = e.get("params", {})
            if m == "Runtime.consoleAPICalled":
                rows.append({"t": p.get("type"), "text": " ".join(
                    str(a.get("value", a.get("description", ""))) for a in p.get("args", []))[:300]})
            elif m == "Log.entryAdded":
                rows.append({"t": p["entry"].get("level"), "text": p["entry"].get("text", "")[:300]})
            elif m == "Runtime.exceptionThrown":
                d = p.get("exceptionDetails", {})
                rows.append({"t": "exception", "text": (d.get("exception", {}).get("description") or d.get("text", ""))[:300]})
        out(rows)

    elif cmd == "open":
        r = c.send("Target.createTarget", url=args[0])
        out({"targetId": r["targetId"], "url": args[0]})

    elif cmd == "nav":
        t = c.pick(args[0])
        s = c.attach(t)
        c.send("Page.enable", session=s)
        c.send("Page.navigate", session=s, url=args[1])
        time.sleep(2)
        out({"url": c.eval(s, "location.href"), "title": c.eval(s, "document.title")})

    elif cmd == "dom":
        t = c.pick(args[0])
        sel = args[1] if len(args) > 1 and not args[1].startswith("--") else "body"
        dest = None
        if "--out" in args:
            dest = args[args.index("--out") + 1]
        html = c.eval(c.attach(t), "(document.querySelector(%s)||document.body).outerHTML" % json.dumps(sel))
        if isinstance(html, dict):
            out(html); return
        if dest:
            open(dest, "w", encoding="utf-8").write(html)
            print("נשמר %s — %d תווים (⚠ לנקות נתונים לפני קומיט)" % (dest, len(html)))
        else:
            print(html[:4000])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
