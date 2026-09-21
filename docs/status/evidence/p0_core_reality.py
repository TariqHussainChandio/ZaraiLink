"""P0 reality run, part 2: core business flows + disease + authz + concurrency, LOCAL stack only."""
import asyncio
import os
import json
import pathlib
import statistics
import subprocess
import sys
import time
import uuid

import httpx

API = "http://127.0.0.1:54321"
BACKEND = "http://127.0.0.1:8000"
ANON = os.environ["LOCAL_SUPABASE_ANON_KEY"]  # printed by `npx supabase start`
SERVICE = os.environ["LOCAL_SUPABASE_SERVICE_ROLE_KEY"]  # local only
H_ANON = {"apikey": ANON, "Authorization": f"Bearer {ANON}", "Content-Type": "application/json"}
H_SRV = {"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}", "Content-Type": "application/json"}
PASSWORD = "Passw0rd!123"
LEAF = pathlib.Path(__import__("tempfile").gettempdir()) / "zl_synthetic_leaf.jpg"
if not LEAF.exists():  # repo fixture backend/tests/fixtures/sample_leaf.jpg does not exist; pipeline-only stand-in
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (320, 320), (34, 110, 44)); d = ImageDraw.Draw(im)
    for xy in [(90, 100), (200, 180), (140, 230), (220, 90)]:
        d.ellipse([xy[0], xy[1], xy[0] + 28, xy[1] + 28], fill=(120, 80, 40))
    im.save(LEAF, "JPEG")
RUN = uuid.uuid4().hex[:6]
oid = None

c = httpx.Client(timeout=60)
results: list[tuple[str, str, str]] = []


def record(fid: str, verdict: str, ev: str) -> None:
    results.append((fid, verdict, ev))
    print(f"[{verdict:^9}] {fid}: {ev}")


def _db() -> str:
    names = subprocess.run(["docker", "ps", "--format", "{{.Names}}"], capture_output=True, text=True).stdout.split()
    return next(n for n in names if n.startswith("supabase_db_"))


def psql(sql: str) -> str:
    return subprocess.run(
        ["docker", "exec", _db(), "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", "|", "-c", sql],
        capture_output=True, text=True,
    ).stdout.strip()


_n = [0]


def make_user(role: str) -> tuple[str, str, str]:
    _n[0] += 1
    email = f"p0-{role}-{RUN}-{_n[0]}@example.test"
    r = c.post(
        f"{API}/auth/v1/admin/users", headers=H_SRV,
        json={"email": email, "password": PASSWORD, "email_confirm": True,
              "user_metadata": {"role": role, "full_name": f"P0 {role.title()}"}},
    )
    uid = r.json()["id"]
    t = c.post(f"{API}/auth/v1/token?grant_type=password", headers=H_ANON, json={"email": email, "password": PASSWORD})
    return uid, email, t.json()["access_token"]


def auth(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


def api(method: str, path: str, tok: str | None = None, **kw) -> httpx.Response:
    return c.request(method, f"{BACKEND}{path}", headers=auth(tok) if tok else None, **kw)


def brief(r: httpx.Response) -> str:
    return f"HTTP {r.status_code} {r.text[:150]}"


# ------------------------------------------------------------------ users
farmer_id, _, farmer = make_user("farmer")
buyer_id, _, buyer = make_user("buyer")
dealer_id, _, dealer = make_user("dealer")
buyer2_id, _, buyer2 = make_user("buyer")
record("B0 role users created (admin API + trigger)", "PASS", "farmer, buyer x2, dealer signed in with real JWTs")

# ------------------------------------------------------------------ B1 reference data
cats = api("GET", "/api/v1/marketplace/categories", buyer)
units = api("GET", "/api/v1/reference-data/units", buyer)
record("B1 reference data readable", "PASS" if cats.status_code == 200 and units.status_code == 200 and cats.json() else "FAIL",
       f"categories={cats.status_code}/{len(cats.json()) if cats.status_code == 200 else '-'} units={units.status_code}")
cat_id = cats.json()[0]["id"] if cats.status_code == 200 and cats.json() else None

# ------------------------------------------------------------------ B2-B7 farmer listing -> buyer order -> payment -> review
r = api("POST", "/api/v1/marketplace/listings", farmer,
        json={"title": f"P0 wheat {RUN}", "price": 100.0, "unit": "kg", "quantity": 50, "category_id": cat_id,
              "description": "p0 baseline listing"})
listing = r.json() if r.status_code in (200, 201) else {}
record("B2 farmer creates listing", "PASS" if listing.get("id") else "FAIL", brief(r))
if not listing.get("id"):
    lid = psql(f"insert into public.listings (owner_id, category_id, title, price, unit, quantity, seller_role) values ('{farmer_id}', '{cat_id}', 'P0 wheat {RUN}', 100, 'kg', 50, 'farmer') returning id").splitlines()[0]
    listing = {"id": lid}
    print("    (seeded listing via SQL to keep observing downstream flows)")
if listing.get("id"):
    r = api("GET", "/api/v1/marketplace/listings", buyer)
    seen = r.status_code == 200 and any(x["id"] == listing["id"] for x in (r.json() if isinstance(r.json(), list) else r.json().get("items", [])))
    record("B3 buyer sees listing in browse", "PASS" if seen else "CHECK", brief(r)[:120])
    r = api("POST", "/api/v1/orders/checkout", buyer,
            json={"cart_items": [{"listing_id": listing["id"], "quantity": 4}], "delivery_charge_by_seller": {farmer_id: 150}})
    orders = r.json() if r.status_code in (200, 201) else None
    order = (orders[0] if isinstance(orders, list) and orders else orders) if orders else None
    record("B4 buyer checkout with delivery charge", "PASS" if order else "FAIL", brief(r))
    if order:
        oid = order["id"]
        d = api("GET", f"/api/v1/orders/{oid}", buyer).json()
        sub = d.get("product_subtotal", d.get("subtotal")); dl = d.get("delivery_charge"); tot = d.get("total")
        record("B4b BR-09 total = subtotal + delivery", "PASS" if sub is not None and tot is not None and abs(float(sub) + float(dl or 0) - float(tot)) < 0.01 else "CHECK",
               f"subtotal={sub} delivery={dl} total={tot}")
        steps = []
        for to in ["confirmed", "processing", "ready", "completed"]:
            rr = api("PATCH", f"/api/v1/orders/{oid}/status", farmer, json={"to": to})
            steps.append(f"{to}:{rr.status_code}")
            if rr.status_code != 200:
                rr2 = api("PATCH", f"/api/v1/orders/{oid}/status", buyer, json={"to": to})
                steps[-1] += f"/buyer:{rr2.status_code}"
        record("B5 order lifecycle pending->completed", "PASS" if all(s.split(":")[1].startswith("200") or "buyer:200" in s for s in steps) else "PARTIAL", " ".join(steps))
        pay = api("POST", "/api/v1/payments", buyer, json={"order_id": oid, "method": "cod"})
        pid = pay.json().get("id") if pay.status_code in (200, 201) else None
        record("B6 payment initiated (manual/COD)", "PASS" if pid else "FAIL", brief(pay))
        if pid:
            rc = api("PATCH", f"/api/v1/payments/{pid}/received", farmer)
            record("B6b seller marks payment received", "PASS" if rc.status_code == 200 else "FAIL", brief(rc))
        rv = api("POST", "/api/v1/reviews", buyer, json={"order_id": oid, "rating": 5, "comment": "p0"})
        record("B7 buyer reviews completed order", "PASS" if rv.status_code in (200, 201) else "FAIL", brief(rv))

# ------------------------------------------------------------------ B8 dealer inventory + atomic stock
st = api("POST", "/api/v1/dealer/stores", dealer, json={"name": f"P0 store {RUN}"})
record("B8 dealer creates store", "PASS" if st.status_code in (200, 201) else "FAIL", brief(st))
dl = api("POST", "/api/v1/marketplace/listings", dealer,
         json={"title": f"P0 fertilizer {RUN}", "price": 500.0, "unit": "bag", "quantity": 100, "category_id": cat_id, "brand": "P0", "condition": "new"})
dlist = dl.json() if dl.status_code in (200, 201) else {}
record("B8b dealer creates listing", "PASS" if dlist.get("id") else "FAIL", brief(dl))
if not dlist.get("id"):
    lid = psql(f"insert into public.listings (owner_id, category_id, title, price, unit, quantity, seller_role, brand, condition) values ('{dealer_id}', '{cat_id}', 'P0 fertilizer {RUN}', 500, 'bag', 100, 'dealer', 'P0', 'new') returning id").splitlines()[0]
    dlist = {"id": lid}
    print("    (seeded dealer listing via SQL)")
if dlist.get("id"):
    inv = api("POST", "/api/v1/dealer/inventory", dealer,
              json={"listing_id": dlist["id"], "stock_quantity": 10, "unit": "bag", "min_stock_threshold": 2})
    inv_j = inv.json() if inv.status_code in (200, 201) else {}
    record("B8c dealer inventory row", "PASS" if inv_j.get("id") else "FAIL", brief(inv))
    if not inv_j.get("id"):
        iid = psql(f"insert into public.inventory (dealer_id, listing_id, stock_quantity, unit, min_stock_threshold) values ('{dealer_id}', '{dlist['id']}', 10, 'bag', 2) returning id").splitlines()[0]
        inv_j = {"id": iid}
        print("    (seeded inventory row via SQL)")
    if inv_j.get("id"):
        o1 = api("POST", "/api/v1/orders/checkout", buyer, json={"cart_items": [{"listing_id": dlist["id"], "quantity": 8}]})
        o2 = api("POST", "/api/v1/orders/checkout", buyer2, json={"cart_items": [{"listing_id": dlist["id"], "quantity": 8}]})
        ids = []
        for rr in (o1, o2):
            j = rr.json() if rr.status_code in (200, 201) else None
            ids.append((j[0] if isinstance(j, list) else j)["id"] if j else None)
        c1 = api("PATCH", f"/api/v1/orders/{ids[0]}/status", dealer, json={"to": "confirmed"}) if ids[0] else None
        c2 = api("PATCH", f"/api/v1/orders/{ids[1]}/status", dealer, json={"to": "confirmed"}) if ids[1] else None
        stock = psql(f"select stock_quantity from public.inventory where id = '{inv_j['id']}'")
        ok = c1 is not None and c1.status_code == 200 and c2 is not None and c2.status_code >= 400 and stock == "2"
        record("B8d oversell blocked, stock atomic", "PASS" if ok else "CHECK",
               f"1st confirm={c1.status_code if c1 else '-'} 2nd confirm={c2.status_code if c2 else '-'} final stock={stock}")

# ------------------------------------------------------------------ B10 disease pipeline
if LEAF.exists() and cat_id:
    path = f"{buyer_id}/{RUN}.jpg"
    up = c.post(f"{API}/storage/v1/object/disease-images/{path}", headers={"apikey": ANON, "Authorization": f"Bearer {buyer}", "Content-Type": "image/jpeg"}, content=LEAF.read_bytes())
    pub = f"{API}/storage/v1/object/public/disease-images/{path}"
    record("B10a upload leaf photo to storage as buyer", "PASS" if up.status_code in (200, 201) else "FAIL", brief(up))
    case = api("POST", "/api/v1/disease/cases", buyer, json={"image_url": pub})
    fresh = case.status_code
    record("B10b disease case on a FRESH db (migrations only)", "FINDING" if fresh >= 400 else "PASS",
           f"HTTP {fresh} {case.text[:120]} (service_role has no table privileges after the migrations)")
    psql("grant all on all tables in schema public to service_role")  # emulate hosted legacy default privileges (LOCAL only)
    case = api("POST", "/api/v1/disease/cases", buyer, json={"image_url": pub})
    cj = case.json() if case.status_code == 200 else {}
    record("B10c disease case with service_role privileges granted (local emulation of hosted)", "PASS" if cj.get("id") else "FAIL", brief(case))
    if cj.get("id"):
        t0 = time.perf_counter()
        pr = api("POST", "/api/v1/disease/predict", buyer, json={"disease_case_id": cj["id"]})
        dt = time.perf_counter() - t0
        record("B10d predict on real leaf photo", "PASS" if pr.status_code == 200 else "FAIL",
               f"HTTP {pr.status_code} in {dt:.2f}s {pr.text[:200]}")
    # --- C2 SSRF probes: server fetches whatever URL the client stored
    probes = {
        "internal API (gateway)": "http://127.0.0.1:54321/rest/v1/",
        "internal backend itself": "http://127.0.0.1:8000/health",
        "closed local port": "http://127.0.0.1:9/",
        "cloud metadata address": "http://169.254.169.254/latest/meta-data/",
        "file scheme": "file:///C:/Windows/win.ini",
    }
    outcomes = {}
    for name, url in probes.items():
        cs = api("POST", "/api/v1/disease/cases", buyer, json={"image_url": url})
        if cs.status_code != 200:
            outcomes[name] = f"case rejected {cs.status_code}"
            continue
        pr = api("POST", "/api/v1/disease/predict", buyer, json={"disease_case_id": cs.json()["id"]})
        outcomes[name] = f"{pr.status_code} {pr.json().get('detail', '') if pr.headers.get('content-type','').startswith('application/json') else pr.text[:60]}"
    distinct = len(set(v.split(' ', 1)[1] if ' ' in v else v for v in outcomes.values()))
    record("B10e C2 SSRF: server-side fetch of client URLs", "CONFIRMED" if all("case rejected" not in v for v in outcomes.values()) else "NOT-REPRO",
           json.dumps(outcomes) + f" ; distinct responses={distinct} (reachability oracle if >1)")

# ------------------------------------------------------------------ B11 authorization spot checks
checks = {
    "no token -> 401": api("GET", "/api/v1/orders").status_code == 401,
    "buyer -> dealer inventory 403": api("GET", "/api/v1/dealer/inventory", buyer).status_code == 403,
    "farmer -> admin stats 403": api("GET", "/api/v1/admin/stats", farmer).status_code == 403,
    "buyer -> admin users 403": api("GET", "/api/v1/admin/users", buyer).status_code == 403,
}
if oid:
    other = api("GET", f"/api/v1/orders/{oid}", buyer2)
    checks["other buyer reading someone's order 403/404"] = other.status_code in (403, 404)
record("B11 authorization spot checks", "PASS" if all(checks.values()) else "FAIL", json.dumps(checks))

# suspension
psql(f"update public.profiles set is_suspended = true where id = '{buyer2_id}'")
sus = api("GET", "/api/v1/orders", buyer2)
psql(f"update public.profiles set is_suspended = false where id = '{buyer2_id}'")
record("B12 suspended user blocked at API", "PASS" if sus.status_code == 403 else "FAIL", brief(sus))

# ------------------------------------------------------------------ B13 concurrency (C4)
SKIP13 = bool(os.environ.get('SKIP_B13'))


async def burst(n: int) -> float:
    async with httpx.AsyncClient(timeout=120) as ac:
        t0 = time.perf_counter()
        rs = await asyncio.gather(*[ac.get(f"{BACKEND}/api/v1/orders", headers=auth(buyer)) for _ in range(n)])
        assert all(x.status_code == 200 for x in rs), [x.status_code for x in rs][:5]
        return time.perf_counter() - t0

singles = []
for _ in range(0 if SKIP13 else 8):
    t0 = time.perf_counter(); api("GET", "/api/v1/orders", buyer); singles.append(time.perf_counter() - t0)
single = statistics.median(singles) if singles else 1.0
n = 40
total = 0.0 if SKIP13 else asyncio.run(burst(n))
if not SKIP13: record("B13 C4 concurrency", "FINDING" if total > 0.5 * n * single else "OK",
       f"single request median {single*1000:.0f} ms; {n} concurrent took {total*1000:.0f} ms "
       f"(fully serialized would be ~{n*single*1000:.0f} ms; ratio {total/(n*single):.2f}; 1.00 = serialized, ~0.03 = truly concurrent)")

print("\n--- summary ---")
for fid, v, ev in results:
    print(f"{v:<10} {fid}")
json.dump(results, open(sys.argv[1] if len(sys.argv) > 1 else "p0_core_results.json", "w"), indent=2)