"""Creates one disposable user per role in the LOCAL Supabase stack, for the P2 emulator run.

Refuses to run against anything but localhost, so it cannot touch the hosted project. The users
exist only in the local Docker database and vanish with `supabase db reset` / `supabase stop`.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

URL = os.environ["LOCAL_SUPABASE_URL"].rstrip("/")
KEY = os.environ["LOCAL_SUPABASE_SERVICE_ROLE_KEY"]
host = urllib.parse.urlparse(URL).hostname
if host not in ("127.0.0.1", "localhost"):
    sys.exit(f"REFUSING: {URL} is not a local stack")

PASSWORD = "P2-Test-Pass-1!"
ROLES = ["farmer", "buyer", "dealer", "expert", "admin"]

for role in ROLES:
    body = {
        "email": f"{role}.p2@example.test",
        "password": PASSWORD,
        "email_confirm": True,
        "user_metadata": {"role": role, "full_name": f"P2 {role.title()}"},
    }
    req = urllib.request.Request(
        f"{URL}/auth/v1/admin/users",
        data=json.dumps(body).encode(),
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            print(role, "created", resp.status)
    except urllib.error.HTTPError as err:
        print(role, "HTTP", err.code, err.read().decode()[:200])
