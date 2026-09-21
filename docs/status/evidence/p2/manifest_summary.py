"""Exact summary of a merged AndroidManifest.xml (XML-parsed, so attribute layout does not matter)."""
import sys, xml.etree.ElementTree as ET
A = "{http://schemas.android.com/apk/res/android}"
def summarize(path):
    root = ET.parse(path).getroot()
    perms = sorted((p.get(A + "name"), p.get(A + "maxSdkVersion")) for p in root.findall("uses-permission"))
    app = root.find("application")
    attrs = {k.replace(A, ""): v for k, v in app.attrib.items() if k.replace(A, "") in
             ("allowBackup", "usesCleartextTraffic", "extractNativeLibs", "debuggable", "supportsRtl", "enableOnBackInvokedCallback")}
    exported = []
    for tag in ("activity", "service", "receiver", "provider"):
        for c in app.findall(tag):
            if c.get(A + "exported") == "true":
                exported.append(f"{tag} {c.get(A + 'name')}")
    schemes = sorted({(d.get(A + "scheme"), d.get(A + "host")) for f in root.iter("intent-filter") for d in f.findall("data")}, key=str)
    return perms, attrs, sorted(exported), schemes
for label, path in zip(sys.argv[1::2], sys.argv[2::2]):
    perms, attrs, exported, schemes = summarize(path)
    print(f"--- {label}")
    print("  permissions :", ", ".join(f"{n.replace('android.permission.', '')}" + (f"(<=API{m})" if m else "") for n, m in perms))
    print("  attributes  :", attrs)
    print("  exported    :", exported)
    print("  link schemes:", schemes)
