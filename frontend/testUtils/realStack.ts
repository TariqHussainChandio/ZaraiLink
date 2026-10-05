/**
 * Shared by the real-stack tests (`*.realstack.test.ts[x]`), which run the app's code against the real FastAPI and the
 * real local Supabase instead of fakes. They only run when ZARAILINK_REALSTACK=1 with the stack up:
 *   npx supabase start
 *   cd backend && uv run uvicorn app.main:app --port 8000     (RATE_LIMIT_DEFAULT high enough for a test run)
 * and REALSTACK_SUPABASE_URL / REALSTACK_ANON_KEY / REALSTACK_SERVICE_KEY / REALSTACK_API_URL in the environment.
 * The only stand-in is where the session token comes from (the device's encrypted storage, which does not exist under
 * Jest): the token itself is a real one from real Supabase Auth, verified by the real backend.
 */

// The project has no Node type definitions (it is a React Native app), so the parts of `http` used here are described.
interface IncomingMessage {
  statusCode?: number;
  headers: Record<string, string | string[] | undefined>;
  on(event: 'data', listener: (chunk: Uint8Array) => void): void;
  on(event: 'end', listener: () => void): void;
}
interface ClientRequest {
  on(event: 'error', listener: (error: Error) => void): void;
  destroy(error?: Error): void;
  write(body: string | Uint8Array): void;
  end(): void;
}
const http = jest.requireActual('http') as {
  request(
    url: string,
    options: { method: string; headers?: Record<string, string> },
    callback: (response: IncomingMessage) => void,
  ): ClientRequest;
};

const childProcess = jest.requireActual('child_process') as {
  execFileSync(file: string, args: string[], options: { encoding: 'utf8' }): string;
};

type Body = string | ArrayBuffer | Uint8Array;

function nodeFetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: Body; signal?: AbortSignal } = {}) {
  return new Promise<unknown>((resolve, reject) => {
    const request = http.request(url, { method: init.method ?? 'GET', headers: init.headers }, incoming => {
      const chunks: Uint8Array[] = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('end', () => {
        const text = chunks.map(chunk => new TextDecoder().decode(chunk, { stream: true })).join('');
        const build = (): unknown => ({
          status: incoming.statusCode,
          ok: (incoming.statusCode ?? 0) >= 200 && (incoming.statusCode ?? 0) < 300,
          headers: { get: (name: string) => (incoming.headers[name.toLowerCase()] as string | undefined) ?? null },
          text: () => Promise.resolve(text),
          json: () => Promise.resolve(text ? JSON.parse(text) : null),
          clone: build,
        });
        resolve(build());
      });
    });
    request.on('error', reject);
    init.signal?.addEventListener('abort', () => request.destroy(new Error('aborted')));
    // A file upload (A3b) sends bytes; everything else sends JSON text.
    if (init.body) request.write(typeof init.body === 'string' ? init.body : new Uint8Array(init.body));
    request.end();
  });
}

/** jest-expo replaces the global `fetch` with a stub, so a real-stack test installs the Node-backed one. */
export function installNodeFetch(): void {
  globalThis.fetch = nodeFetch as never;
}

export const realStackEnabled = process.env.ZARAILINK_REALSTACK === '1';

const SUPABASE_URL = process.env.REALSTACK_SUPABASE_URL ?? '';
const ANON_KEY = process.env.REALSTACK_ANON_KEY ?? '';
const SERVICE_KEY = process.env.REALSTACK_SERVICE_KEY ?? '';
export const API_URL = process.env.REALSTACK_API_URL ?? 'http://127.0.0.1:8000';

/**
 * Dealers and experts sign up pending (A3a, profiles.account_status). Only an admin with a second factor approves them
 * through the API, which the backend smoke suite drives end to end (tests/integration/smoke/test_smoke_account_status
 * .py). A hook test needs a usable dealer, so this approves it in the local stack's database as the owner, as the smoke
 * suite's `promote_to_admin` does for its admin; a non-`authenticated` session may set the status. The decision time
 * stays empty, so the session already open is not asked to sign in again.
 */
export function approveInLocalDatabase(userId: string): void {
  if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error(`not a user id: ${userId}`);
  const names = childProcess.execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' }).split(/\s+/);
  const container = names.find(name => name.startsWith('supabase_db_'));
  if (!container) throw new Error('no local Supabase database container is running');
  const sql = `update public.profiles set account_status = 'approved' where id = '${userId}'`;
  childProcess.execFileSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', sql], {
    encoding: 'utf8',
  });
}

/** A real user signed in through Supabase Auth. A dealer or expert is approved unless `pending` is asked for. */
export async function signUp(
  role: 'buyer' | 'dealer' | 'farmer' | 'expert',
  { pending = false }: { pending?: boolean } = {},
): Promise<string> {
  const email = `rs-${role}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const admin = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
  const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ email, password: 'Passw0rd!123', email_confirm: true, user_metadata: { role } }),
  });
  if (!created.ok) throw new Error(`could not create a user: ${created.status} ${await created.text()}`);
  if ((role === 'dealer' || role === 'expert') && !pending) {
    approveInLocalDatabase(((await created.json()) as { id: string }).id);
  }
  const login = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Passw0rd!123' }),
  });
  return ((await login.json()) as { access_token: string }).access_token;
}

/**
 * The part of supabase-js Storage the app uses (upload, remove), done as real HTTP calls to the local Storage API with
 * the user's own token, so the bucket policies decide exactly as they do for the app on a device. supabase-js itself
 * needs a fetch with streaming bodies that this test environment does not have; the requests are the same.
 */
export function storageFor(token: string) {
  const headers = { apikey: ANON_KEY, Authorization: `Bearer ${token}` };
  return {
    from: (bucket: string) => ({
      upload: async (path: string, content: ArrayBuffer, options: { contentType: string }) => {
        const response = (await nodeFetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': options.contentType },
          body: content,
        })) as { ok: boolean; text(): Promise<string> };
        return response.ok ? { data: { path }, error: null } : { data: null, error: new Error(await response.text()) };
      },
      remove: async (paths: string[]) => {
        await nodeFetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
          method: 'DELETE',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: paths }),
        });
        return { data: [], error: null };
      },
    }),
  };
}
