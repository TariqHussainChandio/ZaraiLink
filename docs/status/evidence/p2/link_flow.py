"""Real password-reset deep-link flow against the LOCAL stack (P2 evidence for the onNewIntent question).

1. Request a reset from the app's own screen. 2. Read the email from the local mail catcher.
3. Resolve its link to the zarailink:// URL GoTrue redirects to. 4. Open that URL while the app runs.
5. Report whether the app moved to the reset-password screen (i.e. JavaScript received the link).
"""
import html, http.client, json, os, re, sys, time, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
import appstate, ui

MAIL = "http://127.0.0.1:54324"
EMAIL = "farmer.p2@example.test"
OUT = sys.argv[1]
LABEL = sys.argv[2]

def mail_ids():
    with urllib.request.urlopen(f"{MAIL}/api/v1/messages", timeout=10) as r:
        return {m["ID"] for m in json.load(r)["messages"]}

def newest_reset_link(seen):
    for _ in range(40):
        with urllib.request.urlopen(f"{MAIL}/api/v1/messages", timeout=10) as r:
            msgs = json.load(r)["messages"]
        for m in msgs:
            if m["ID"] in seen or not any(EMAIL == t["Address"] for t in m["To"]):
                continue
            with urllib.request.urlopen(f"{MAIL}/api/v1/message/{m['ID']}", timeout=10) as r:
                body = json.load(r)
            found = re.search(r'href="([^"]*type=recovery[^"]*)"', body.get("HTML", "")) or re.search(r"(http\S*type=recovery\S*)", body.get("Text", ""))
            if found:
                return html.unescape(found.group(1))
        time.sleep(2)
    return None

def redirect_target(link):
    p = urllib.parse.urlparse(link)
    assert p.hostname in ("127.0.0.1", "localhost"), "refusing non-local link"
    conn = http.client.HTTPConnection(p.hostname, p.port, timeout=15)
    conn.request("GET", p.path + "?" + p.query)
    resp = conn.getresponse()
    return resp.status, resp.getheader("Location")

seen = mail_ids()
assert appstate.fresh_login_screen(), "login screen never appeared"
ui.tap("Forgot your password?"); time.sleep(3)
field = next(n for n in ui.dump() if n["cls"] == "EditText" and n["desc"] == "Email")
ui.adb("shell", "input", "tap", str(field["cx"]), str(field["cy"]))
ui.type_text(EMAIL)
ui.adb("shell", "input", "keyevent", "KEYCODE_BACK"); time.sleep(1)
ui.tap("Send reset link"); time.sleep(4)
print(f"[{LABEL}] after requesting reset, app shows:", [n["text"] for n in ui.dump() if n["text"]][:6])

link = newest_reset_link(seen)
print(f"[{LABEL}] reset email received:", bool(link))
status, target = redirect_target(link)
print(f"[{LABEL}] GoTrue verify -> HTTP {status}, redirect scheme:", (target or "").split(":")[0], "| has code:", "code=" in (target or ""))

before = sorted(n["text"] for n in ui.dump() if n["text"])
print(f"[{LABEL}] opening the link while the app is running ...")
print("   ", appstate.start_link(target)[:80])
time.sleep(12)
nodes = ui.dump()
after = sorted(n["text"] for n in nodes if n["text"])
ui.shot(f"{OUT}/link-{LABEL}.png")
moved = after != before
print(f"[{LABEL}] screen texts changed after the link: {moved}")
print(f"[{LABEL}] visible after:", [t for t in after][:10])
