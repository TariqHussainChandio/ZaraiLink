"""Shared helpers: fresh app start on the dev client, returns when the login screen is usable."""
import os, subprocess, sys, time
sys.path.insert(0, os.path.dirname(__file__))
import ui
DEEP = "exp+zarailink://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081"
def start_link(uri):
    env = dict(os.environ, MSYS_NO_PATHCONV="1")
    return subprocess.run(["adb", "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", uri, "com.zarailink"],
                          capture_output=True, text=True, env=env).stdout.strip()
def fresh_login_screen():
    ui.adb("shell", "pm", "clear", "com.zarailink")
    start_link(DEEP)
    for _ in range(80):
        nodes = ui.dump()
        if ui.find("isn't responding", nodes): ui.tap("Close app")
        if ui.find("This is the developer menu", nodes): ui.tap("Continue"); time.sleep(2); continue
        if ui.find("Toggle performance monitor", nodes): ui.tap("Close"); time.sleep(2); continue
        if any(n["cls"] == "EditText" and n["desc"] == "Email" for n in nodes): return True
        time.sleep(3)
    return False
