// Public app configuration for tests. frontend/config/env.ts validates these at import time and throws
// when one is missing, so they are set before any test file loads. None of these hosts is
// contacted: every network call in a unit test is faked.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:8000';
process.env.EXPO_PUBLIC_APP_ENV = 'test';
