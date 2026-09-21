"""Tiny uiautomator driver for the P2 emulator run (scratch tooling, not part of the repo).

Usage: python ui.py dump | shot <file.png> | tap "<text>" | type "<text>" | key <KEYCODE> | wait "<text>" [seconds]
"""
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET


def adb(*args, binary=False):
    proc = subprocess.run(["adb", *args], capture_output=True, text=not binary)
    return proc.stdout


def dump():
    adb("shell", "uiautomator", "dump", "/sdcard/ui.xml")
    xml = adb("exec-out", "cat", "/sdcard/ui.xml")
    try:
        root = ET.fromstring(xml[xml.index("<"):])
    except (ValueError, ET.ParseError):
        return []
    nodes = []
    for n in root.iter("node"):
        m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", n.get("bounds", ""))
        if not m:
            continue
        x1, y1, x2, y2 = map(int, m.groups())
        nodes.append({
            "text": n.get("text", ""), "desc": n.get("content-desc", ""), "id": n.get("resource-id", ""),
            "cls": n.get("class", "").split(".")[-1], "clickable": n.get("clickable") == "true",
            "cx": (x1 + x2) // 2, "cy": (y1 + y2) // 2, "b": (x1, y1, x2, y2),
        })
    return nodes


def find(label, nodes=None):
    nodes = nodes if nodes is not None else dump()
    for n in nodes:
        if n["text"] == label or n["desc"] == label:
            return n
    for n in nodes:
        if label.lower() in n["text"].lower() or label.lower() in n["desc"].lower():
            return n
    return None


def tap(label):
    n = find(label)
    if not n:
        print(f"NOT FOUND: {label}")
        return False
    adb("shell", "input", "tap", str(n["cx"]), str(n["cy"]))
    return True


def type_text(s):
    adb("shell", "input", "text", s.replace(" ", "%s"))


def shot(path):
    data = adb("exec-out", "screencap", "-p", binary=True)
    with open(path, "wb") as f:
        f.write(data)


def wait(label, seconds=60):
    end = time.time() + seconds
    while time.time() < end:
        if find(label):
            return True
        time.sleep(2)
    return False


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "dump":
        for n in dump():
            if n["text"] or n["desc"] or n["cls"] == "EditText":
                print(f'{n["cls"]:14s} text={n["text"]!r:40.40} desc={n["desc"]!r:24.24} tap=({n["cx"]},{n["cy"]})')
    elif cmd == "shot":
        shot(sys.argv[2])
    elif cmd == "tap":
        print("tapped" if tap(sys.argv[2]) else "missing")
    elif cmd == "type":
        type_text(sys.argv[2])
    elif cmd == "key":
        adb("shell", "input", "keyevent", sys.argv[2])
    elif cmd == "wait":
        print("found" if wait(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 60) else "timeout")
