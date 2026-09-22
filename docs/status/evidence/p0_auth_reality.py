"""P0 reality run, part 1: auth flows against LOCAL Supabase (Docker) + LOCAL FastAPI.

Everything here talks to 127.0.0.1 only. The keys below are the public, deterministic demo keys the
Supabase CLI prints for a local stack; they are not secrets and do not work on any hosted project.
Local data is disposable (no dummy data ever reaches the real project).
"""
import base64
import hashlib
import json
import re
import secrets
import subprocess
import sys
import urllib.parse

import os
import httpx

API = "http://127.0.0.1:54321"
BACKEND = "http://127.0.0.1:8000"
MAILPIT = "http://127.0.0.1:54324"
ANON = os.environ["LOCAL_SUPABASE_ANON_KEY"]  # printed by `npx supabase start`
SERVICE = os.environ["LOCAL_SUPABASE_SERVICE_ROLE_KEY"]  # local only
H_ANON = {"apikey": ANON, "Authorization": f"Bearer {ANON}", "Content-Type": "application/json"}
H_SRV = {"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}", "Content-Type": "application/json"}
PASSWORD = "Passw0rd!123"

c = httpx.Client(timeout=30)
results: list[tuple[str, str, str]] = []  # (id, verdict, evidence)


def record(flow_id: str, verdict: str, evidence: str) -> None:
    results.append((flow_id, verdict, evidence))
    print(f"[{verdict:^9}] {flow_id}: {evidence}")


def _db_container() -> str:
    out = subprocess.run(["docker", "ps", "--format", "{{.Names}}"], capture_output=True, text=True).stdout.split()
    return next(n for n in out if n.startswith("supabase_db_"))


def psql(sql: str) -> list[list[str]]:
    """Reads via the postgres superuser inside the local DB container. The service_role REST key is not
    usable here: fresh databases built from the migrations give service_role no table privileges
    (observed 42501), which is itself a P0 finding."""
    out = subprocess.run(
        ["docker", "exec", _db_container(), "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", "|", "-c", sql],
        capture_output=True, text=True,
    ).stdout.strip()
    return [line.split("|") for line in out.splitlines() if line]


def profile_row(user_id: str) -> dict | None:
    rows = psql(f"select id, role, full_name, is_suspended from public.profiles where id = '{user_id}'")
    return dict(zip(["id", "role", "full_name", "is_suspended"], rows[0])) if rows else None


def mail_latest(to_addr: str) -> dict | None:
    msgs = c.get(f"{MAILPIT}/api/v1/messages").json().get("messages", [])
    for m in msgs:
        if any(t["Address"] == to_addr for t in m["To"]):
            return c.get(f"{MAILPIT}/api/v1/message/{m['ID']}").json()
    return None


# ---------------------------------------------------------------- setup
c.delete(f"{MAILPIT}/api/v1/messages")

# ---------------------------------------------------------------- A0 baseline health
h = c.get(f"{BACKEND}/health")
record("A0 backend /health", "PASS" if h.status_code == 200 else "FAIL", f"{h.status_code} {h.text[:60]}")
docs = c.get(f"{BACKEND}/docs")
record("A0b /docs exposed", "FINDING" if docs.status_code == 200 else "OK", f"GET /docs -> {docs.status_code} (H4: docs open)")

# ---------------------------------------------------------------- A1 forged-admin signup (C1)
import uuid
email_admin = f"p0-forged-admin-{uuid.uuid4().hex[:6]}@example.test"
r = c.post(
    f"{API}/auth/v1/signup",
    headers=H_ANON,
    json={"email": email_admin, "password": PASSWORD, "data": {"role": "admin", "full_name": "P0 Forged Admin"}},
)
body = r.json()
uid_admin = body.get("id") or (body.get("user") or {}).get("id")
prof = profile_row(uid_admin) if uid_admin else None
verdict = "CONFIRMED" if prof and prof["role"] == "admin" else "NOT-REPRO"
record("A1 C1 forged-admin signup", verdict, f"signup HTTP {r.status_code}; stored profile = {prof}")

# ---------------------------------------------------------------- A2 what does the confirmation email contain? (C3)
mail = mail_latest(email_admin)
if not mail:
    record("A2 signup email arrives", "FAIL", "no email in local mail catcher")
else:
    text = mail.get("Text", "") or ""
    html = mail.get("HTML", "") or ""
    codes = re.findall(r"(?<![\w/=&%.-])\d{6}(?![\w/=&%.-])", text)
    links = re.findall(r"https?://[^\s\"'<>]+", html + " " + text)
    record(
        "A2 C3 signup email content",
        "CONFIRMED" if not codes and links else "DIFFERENT",
        f"subject={mail['Subject']!r}; standalone 6-digit codes in body={codes}; links={len(links)} "
        f"(VerifyOtpScreen needs a typed code)",
    )
    # A3 follow the confirmation link exactly as a user's browser would
    confirm = next((l.replace("&amp;", "&") for l in links if "/auth/v1/verify" in l), None)
    if confirm:
        rr = c.get(confirm, follow_redirects=False)
        loc = rr.headers.get("location", "")
        frag = urllib.parse.parse_qs(urllib.parse.urlparse(loc).fragment)
        access = (frag.get("access_token") or [None])[0]
        record("A3 confirm via link", "PASS" if access else "FAIL", f"HTTP {rr.status_code}; session in redirect fragment={bool(access)}")
        if access:
            # A3b the forged admin's session works against the real backend as an ADMIN
            prof_api = c.get(f"{BACKEND}/api/v1/notifications/unread-count", headers={"Authorization": f"Bearer {access}"})
            rest_paths = [p for p in c.get(f"{BACKEND}/openapi.json").json()["paths"] if p.startswith("/api/v1/admin")]
            admin_call = None
            for p in rest_paths:
                if "{" not in p:
                    admin_call = (p, c.get(f"{BACKEND}{p}", headers={"Authorization": f"Bearer {access}"}))
                    break
            record(
                "A3b C1 impact: forged admin hits admin API",
                "CONFIRMED" if admin_call and admin_call[1].status_code == 200 else "CHECK",
                f"/notifications/unread-count -> {prof_api.status_code}; {admin_call[0] if admin_call else 'n/a'} -> "
                f"{admin_call[1].status_code if admin_call else 'n/a'}",
            )

# ---------------------------------------------------------------- A4 phone signup
r = c.post(f"{API}/auth/v1/signup", headers=H_ANON, json={"phone": "+923001234567", "password": PASSWORD})
record("A4 phone sign-up", "FAIL" if r.status_code >= 400 else "CHECK", f"HTTP {r.status_code} {r.text[:140]}")

# ---------------------------------------------------------------- A5 password reset (PKCE, exactly as the app requests it)
verifier = secrets.token_urlsafe(48)
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
r = c.post(
    f"{API}/auth/v1/recover?redirect_to=" + urllib.parse.quote("zarailink://reset-password", safe=""),
    headers=H_ANON,
    json={"email": email_admin, "code_challenge": challenge, "code_challenge_method": "s256"},
)
rec_mail = None
if r.status_code == 200:
    all_msgs = c.get(f"{MAILPIT}/api/v1/messages").json().get("messages", [])
    subj = [m["Subject"] for m in all_msgs]
    rec_id = next((m["ID"] for m in all_msgs if "eset" in m["Subject"] or "ecover" in m["Subject"]), None)
    rec_mail = c.get(f"{MAILPIT}/api/v1/message/{rec_id}").json() if rec_id else None
if rec_mail:
    body_all = (rec_mail.get("HTML", "") or "") + (rec_mail.get("Text", "") or "")
    rlinks = re.findall(r"https?://[^\s\"'<>]+", body_all)
    record("A5 password-reset email", "PARTIAL", f"HTTP {r.status_code}; email holds a link (redirect_to zarailink://... needs a device to prove); links={len(rlinks)}")
else:
    record("A5 password-reset email", "CHECK", f"HTTP {r.status_code} {r.text[:120]}")

# ---------------------------------------------------------------- A6 email sign-in of a confirmed user
r = c.post(f"{API}/auth/v1/token?grant_type=password", headers=H_ANON, json={"email": email_admin, "password": PASSWORD})
tok = r.json().get("access_token") if r.status_code == 200 else None
record("A6 email sign-in (confirmed user)", "PASS" if tok else "FAIL", f"HTTP {r.status_code}")

# ---------------------------------------------------------------- A7 backend token checks
noauth = c.get(f"{BACKEND}/api/v1/notifications/unread-count")
bad = c.get(f"{BACKEND}/api/v1/notifications/unread-count", headers={"Authorization": "Bearer not.a.jwt"})
good = c.get(f"{BACKEND}/api/v1/notifications/unread-count", headers={"Authorization": f"Bearer {tok}"}) if tok else None
record(
    "A7 backend auth gate",
    "PASS" if noauth.status_code == 401 and bad.status_code == 401 and good is not None and good.status_code == 200 else "FAIL",
    f"no token={noauth.status_code}, garbage token={bad.status_code}, valid token={good.status_code if good else 'n/a'}",
)

# ---------------------------------------------------------------- A8 email rate limit (config.toml: auth.rate_limit.email_sent = 2)
r = c.post(f"{API}/auth/v1/signup", headers=H_ANON, json={"email": f"p0-third-{uuid.uuid4().hex[:6]}@example.test", "password": PASSWORD})
record("A8 third auth email within the hour", "INFO" if r.status_code == 200 else "FINDING", f"HTTP {r.status_code}: the local stack does not enforce auth.rate_limit.email_sent (config.toml says it needs custom SMTP); the hosted default sender is capped at 2 messages/hour by the platform, and pushing config.toml with email_sent = 2 to a custom-SMTP project would cap real users at 2/hour")

print("\n--- summary ---")
for fid, v, ev in results:
    print(f"{v:<10} {fid}")
json.dump(results, open(sys.argv[1] if len(sys.argv) > 1 else "p0_auth_results.json", "w"), indent=2)
