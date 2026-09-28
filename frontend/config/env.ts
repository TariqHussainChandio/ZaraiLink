import { z } from 'zod';

// Public configuration, baked into the JavaScript bundle at build time from .env (see
// .env.example). Everything here ships inside the app and can be read by anyone who installs it,
// so it must never hold a secret. The Supabase anon key is safe only because row-level security
// protects the data.
//
// The schema is keyed by the real variable names so that a validation message tells the developer
// exactly which line of .env to fix.
const schema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.url(),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  EXPO_PUBLIC_API_BASE_URL: z.url(),
  EXPO_PUBLIC_APP_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
});

// Expo replaces only the literal form `process.env.EXPO_PUBLIC_NAME` when it bundles. A
// destructured or computed access is left as-is and reads undefined on the device, so each
// variable is named in full below.
const parsed = schema.safeParse({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
});

// Fail at startup with a readable message instead of letting the app boot half-configured and
// fail later with an opaque network error. The message names variables, never their values.
if (!parsed.success) {
  throw new Error(
    `Invalid app configuration. Copy .env.example to .env and fix these EXPO_PUBLIC_ values:\n${z.prettifyError(parsed.error)}`,
  );
}

export const ENV = {
  supabaseUrl: parsed.data.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: parsed.data.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  apiBaseUrl: parsed.data.EXPO_PUBLIC_API_BASE_URL,
  appEnv: parsed.data.EXPO_PUBLIC_APP_ENV,
} as const;
