"""Logs in as each disposable local user on the emulator and records what the app shows (P2 evidence).

Each role starts from a cleared app (`pm clear`), opens the dev client through its deep link, signs in
through the real UI against the local Supabase stack and the local backend, and saves a screenshot.
"""
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
import ui  # noqa: E402

OUT = sys.argv[1]
ROLES = sys.argv[2].split(",")
PASSWORD = "P2-Test-Pass-1!"
DEEP_LINK = "exp+zarailink://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081"


def fresh_start():
    ui.adb("shell", "pm", "clear", "com.zarailink")
    env = dict(os.environ, MSYS_NO_PATHCONV="1")
    subprocess.run(["adb", "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", DEEP_LINK, "com.zarailink"],
                   capture_output=True, env=env)
    # After a clear, the dev client shows a welcome sheet and then its full menu; both must go before
    # the app underneath is usable. Loop until the email field is actually reachable.
    for _ in range(80):
        close_stray_dialogs()
        nodes = ui.dump()
        if ui.find("This is the developer menu", nodes):
            ui.tap("Continue")
            time.sleep(2)
            continue
        if ui.find("Toggle performance monitor", nodes):
            ui.tap("Close")
            time.sleep(2)
            continue
        if any(n["cls"] == "EditText" and n["desc"] == "Email" for n in nodes):
            return True
        time.sleep(3)
    return False


def close_stray_dialogs():
    nodes = ui.dump()
    if ui.find("isn't responding", nodes):
        ui.tap("Close app")


def login(role):
    nodes = ui.dump()
    email = next(n for n in nodes if n["cls"] == "EditText" and n["desc"] == "Email")
    pw = next(n for n in nodes if n["cls"] == "EditText" and n["desc"] == "Password")
    ui.adb("shell", "input", "tap", str(email["cx"]), str(email["cy"]))
    ui.type_text(f"{role}.p2@example.test")
    ui.adb("shell", "input", "tap", str(pw["cx"]), str(pw["cy"]))
    ui.type_text(PASSWORD)
    ui.adb("shell", "input", "keyevent", "KEYCODE_BACK")  # hide the keyboard
    time.sleep(1)
    ui.tap("Sign In")


for role in ROLES:
    print(f"=== {role}")
    close_stray_dialogs()
    if not fresh_start():
        print("  login screen never appeared")
        ui.shot(f"{OUT}/login-{role}-FAILED-start.png")
        continue
    time.sleep(2)
    login(role)
    end = time.time() + 90
    landed = False
    while time.time() < end:
        close_stray_dialogs()
        nodes = ui.dump()
        if nodes and not ui.find("Welcome back", nodes) and not ui.find("Sign In", nodes):
            landed = True
            break
        time.sleep(3)
    time.sleep(4)
    ui.shot(f"{OUT}/login-{role}.png")
    texts = [n["text"] for n in ui.dump() if n["text"]][:14]
    print("  landed:", landed, "| visible text:", texts)
