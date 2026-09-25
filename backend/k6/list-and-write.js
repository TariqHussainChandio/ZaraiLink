// P5 (item 2) benchmark: does the backend serve concurrent requests, or serialize them?
// Run one scenario at a fixed VU count for a fixed duration; compare completed-request throughput
// across VU levels (flat = serialized, roughly linear = concurrent). See
// docs/architecture/adr/0001-async-supabase-client-migration.md for how it was run.
//
//   docker run --rm -i -v "$PWD/backend/k6:/scripts" grafana/k6 run /scripts/list-and-write.js \
//     -e BASE_URL=http://host.docker.internal:8000 -e SUPABASE_URL=http://host.docker.internal:54321 \
//     -e ANON_KEY=... -e SERVICE_KEY=... -e SCENARIO=read|write -e VUS=50 -e DURATION=20s
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL;
const SB = __ENV.SUPABASE_URL;
const ANON = __ENV.ANON_KEY;
const SERVICE = __ENV.SERVICE_KEY;
const SCENARIO = __ENV.SCENARIO || 'read';
const VUS = parseInt(__ENV.VUS || '10', 10);

export const options = {
  vus: VUS,
  duration: __ENV.DURATION || '20s',
  setupTimeout: '120s',
  // Submetrics restricted to the load phase (setup's user creation is bcrypt-slow and would pollute totals).
  thresholds: {
    'http_req_duration{scenario:default}': ['max>=0'],
    'http_reqs{scenario:default}': ['count>=0'],
    'http_req_failed{scenario:default}': ['rate>=0'],
  },
};

function makeUser(role, tag) {
  const email = `k6-${role}-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const admin = http.post(
    `${SB}/auth/v1/admin/users`,
    JSON.stringify({ email, password: 'Passw0rd!123', email_confirm: true, user_metadata: { role } }),
    { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' } },
  );
  const login = http.post(
    `${SB}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email, password: 'Passw0rd!123' }),
    { headers: { apikey: ANON, 'Content-Type': 'application/json' } },
  );
  return login.json('access_token');
}

export function setup() {
  if (SCENARIO === 'authread') {
    const buyers = [];
    for (let i = 0; i < Math.min(VUS, 20); i++) buyers.push(makeUser('buyer', `a${i}`));
    return { buyers };
  }
  if (SCENARIO !== 'write') return {};
  const farmer = makeUser('farmer', 'f');
  const auth = { headers: { Authorization: `Bearer ${farmer}`, 'Content-Type': 'application/json' } };
  const cats = http.get(`${BASE}/api/v1/marketplace/categories`);
  const listing = http.post(
    `${BASE}/api/v1/marketplace/listings`,
    JSON.stringify({ title: 'k6 wheat', price: 10, unit: 'kg', quantity: 1000000, category_id: cats.json()[0].id }),
    auth,
  );
  const buyers = [];
  for (let i = 0; i < Math.min(VUS, 20); i++) buyers.push(makeUser('buyer', `b${i}`));
  return { listingId: listing.json('id'), buyers };
}

export default function (data) {
  if (SCENARIO === 'read') {
    const res = http.get(`${BASE}/api/v1/marketplace/listings`);
    check(res, { 'list 200': (r) => r.status === 200 });
    return;
  }
  const token = data.buyers[(__VU - 1) % data.buyers.length];
  if (SCENARIO === 'authread') {
    const r = http.get(`${BASE}/api/v1/orders`, { headers: { Authorization: `Bearer ${token}` } });
    check(r, { 'orders 200': (x) => x.status === 200 });
    return;
  }
  const res = http.post(
    `${BASE}/api/v1/orders/checkout`,
    JSON.stringify({ cart_items: [{ listing_id: data.listingId, quantity: 1 }] }),
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
  );
  check(res, { 'checkout 2xx': (r) => r.status >= 200 && r.status < 300 });
}
