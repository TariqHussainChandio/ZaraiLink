/**
 * A chainable stand-in for a Supabase PostgREST query builder. Every query-shaping method
 * (`.eq()`, `.order()`, etc.) returns the same object so calls can be chained arbitrarily deep
 * like the real builder; the chain resolves via `.then()` (the real builder is a thenable, not
 * a Promise) to whatever `{ data, error }` the test configures.
 */
export function makeQueryBuilder(result: { data: unknown; error: unknown }) {
  const methods = [
    'select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'in', 'contains',
    'order', 'limit', 'range', 'match', 'or', 'ilike', 'like', 'gte', 'lte', 'gt', 'lt', 'is', 'not',
  ] as const;

  const builder: Record<string, unknown> = {};
  for (const method of methods) {
    builder[method] = jest.fn(() => builder);
  }
  builder.single = jest.fn(() => Promise.resolve(result));
  builder.maybeSingle = jest.fn(() => Promise.resolve(result));
  // The real builder is a thenable: `await supabase.from(x).select(y)` works without `.single()`.
  builder.then = (onResolve: (value: typeof result) => unknown) => Promise.resolve(result).then(onResolve);

  return builder;
}

export interface SupabaseMockOptions {
  /** Keyed by table name; falls back to `{ data: null, error: null }` for any table not listed. */
  tables?: Record<string, { data: unknown; error: unknown }>;
  session?: { access_token: string; user: { id: string } } | null;
  storageUploadResult?: { data: unknown; error: unknown };
  storagePublicUrl?: string;
}

/** Builds a fake `supabase` client covering the subset of the SDK this app actually calls:
 * `.from()`, `.auth.getSession()`/`signOut()`/`onAuthStateChange()`, `.storage.from()`. */
export function makeSupabaseMock(options: SupabaseMockOptions = {}) {
  const tables = options.tables ?? {};
  const defaultResult = { data: null, error: null };

  const from = jest.fn((table: string) => makeQueryBuilder(tables[table] ?? defaultResult));

  const auth = {
    getSession: jest.fn(() =>
      Promise.resolve({ data: { session: options.session ?? null }, error: null }),
    ),
    signOut: jest.fn(() => Promise.resolve({ error: null })),
    signInWithPassword: jest.fn(() => Promise.resolve({ data: { session: null, user: null }, error: null })),
    signUp: jest.fn(() => Promise.resolve({ data: { session: null, user: null }, error: null })),
    verifyOtp: jest.fn(() => Promise.resolve({ data: { session: null, user: null }, error: null })),
    resend: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    resetPasswordForEmail: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    exchangeCodeForSession: jest.fn(() => Promise.resolve({ data: { session: null, user: null }, error: null })),
    updateUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
    onAuthStateChange: jest.fn(() => ({
      data: { subscription: { unsubscribe: jest.fn() } },
    })),
  };

  const storage = {
    from: jest.fn(() => ({
      upload: jest.fn(() => Promise.resolve(options.storageUploadResult ?? { data: { path: 'mock/path' }, error: null })),
      getPublicUrl: jest.fn(() => ({ data: { publicUrl: options.storagePublicUrl ?? 'https://example.supabase.co/storage/mock' } })),
      createSignedUrl: jest.fn(() => Promise.resolve({ data: { signedUrl: 'https://example.supabase.co/signed/mock' }, error: null })),
      createSignedUrls: jest.fn(() => Promise.resolve({ data: [], error: null })),
    })),
  };

  const channel = jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
  }));
  const removeChannel = jest.fn();

  return { from, auth, storage, channel, removeChannel, rpc: jest.fn(() => Promise.resolve(defaultResult)) };
}
