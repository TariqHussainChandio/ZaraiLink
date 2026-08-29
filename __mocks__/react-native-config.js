// react-native-config resolves via a native TurboModule that doesn't exist under Jest.
// Stub fake-but-valid values so importing src/config/env.ts doesn't throw in tests.
module.exports = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  API_BASE_URL: 'http://127.0.0.1:8000',
  APP_ENV: 'test',
};
