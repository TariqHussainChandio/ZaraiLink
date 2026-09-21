"""Call every parameterless GET route with the role most likely to be authorized; report non-2xx. LOCAL only."""
import os
import httpx, uuid, json, sys
API="http://127.0.0.1:54321"; BACKEND="http://127.0.0.1:8000"
ANON=os.environ['LOCAL_SUPABASE_ANON_KEY']
SERVICE=os.environ['LOCAL_SUPABASE_SERVICE_ROLE_KEY']
c=httpx.Client(timeout=90); run=uuid.uuid4().hex[:6]
def mk(role):
    e=f"sweep-{role}-{run}@example.test"
    c.post(f"{API}/auth/v1/admin/users",headers={"apikey":SERVICE,"Authorization":f"Bearer {SERVICE}"},json={"email":e,"password":"Passw0rd!123","email_confirm":True,"user_metadata":{"role":role,"full_name":role}})
    return c.post(f"{API}/auth/v1/token?grant_type=password",headers={"apikey":ANON},json={"email":e,"password":"Passw0rd!123"}).json()["access_token"]
tok={r:mk(r) for r in ["admin","farmer","buyer","dealer","expert"]}
spec=c.get(f"{BACKEND}/openapi.json").json()
def role_for(p):
    for k,r in [("/admin","admin"),("/dealer","dealer"),("/farmer","farmer"),("/analytics/farmer","farmer"),("/analytics/dealer","dealer"),("/analytics/expert","expert"),("/analytics/admin","admin"),("/expert/me","expert"),("/consultations/assigned","expert"),("/expert/admin","admin"),("/marketplace/listings/moderation","admin")]:
        if p.startswith("/api/v1"+k) or p=="/api/v1"+k: return r
    return "buyer"
rows=[]
for path,ops in sorted(spec["paths"].items()):
    if "get" in ops and "{" not in path and path!="/health":
        r=c.get(f"{BACKEND}{path}",headers={"Authorization":f"Bearer {tok[role_for(path)]}"})
        rows.append((path,role_for(path),r.status_code,r.text[:90] if r.status_code>=400 else ""))
bad=[x for x in rows if x[2]>=400]
print(f"GET routes exercised: {len(rows)}; non-2xx: {len(bad)}")
for x in bad: print("  ",x)
print("2xx:", sum(1 for x in rows if x[2]<300))
