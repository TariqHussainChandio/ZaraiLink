// frontend/config/env.ts validates process.env when it is first imported, so each test loads a fresh copy
// of the module under a controlled environment.

const VALID = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-value',
  EXPO_PUBLIC_API_BASE_URL: 'http://10.0.2.2:8000',
  EXPO_PUBLIC_APP_ENV: 'development',
};

type EnvOverrides = Record<string, string | undefined>;

function loadEnv(overrides: EnvOverrides = {}) {
  const saved = { ...process.env };
  Object.assign(process.env, VALID);
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    let loaded: typeof import('./env') | undefined;
    jest.isolateModules(() => {
      loaded = require('./env');
    });
    return loaded!.ENV;
  } finally {
    process.env = saved;
  }
}

function messageFor(overrides: EnvOverrides): string {
  try {
    loadEnv(overrides);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the configuration to be refused');
}

describe('ENV', () => {
  it('exposes the four public values under their app-facing names', () => {
    expect(loadEnv()).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key-value',
      apiBaseUrl: 'http://10.0.2.2:8000',
      appEnv: 'development',
    });
  });

  it('defaults the app environment to development when it is not set', () => {
    expect(loadEnv({ EXPO_PUBLIC_APP_ENV: undefined }).appEnv).toBe('development');
  });

  it.each(['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_API_BASE_URL'])(
    'refuses to start without %s and names it in the message',
    name => {
      expect(() => loadEnv({ [name]: undefined })).toThrow(name);
    },
  );

  it('refuses a URL that is not a URL', () => {
    expect(() => loadEnv({ EXPO_PUBLIC_API_BASE_URL: 'not a url' })).toThrow('EXPO_PUBLIC_API_BASE_URL');
  });

  it('refuses an app environment it does not know', () => {
    expect(() => loadEnv({ EXPO_PUBLIC_APP_ENV: 'local' })).toThrow('EXPO_PUBLIC_APP_ENV');
  });

  it('never repeats a value in the error message, whether the value is valid or the one that failed', () => {
    const message = messageFor({
      // Fails validation: the message must name the variable but not echo what was typed.
      EXPO_PUBLIC_API_BASE_URL: 'secret-value-that-fails',
      // Valid, and a secret in real life: it must not appear either.
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'secret-value-that-passes',
    });

    expect(message).toContain('EXPO_PUBLIC_API_BASE_URL');
    expect(message).not.toContain('secret-value-that-fails');
    expect(message).not.toContain('secret-value-that-passes');
  });
});
