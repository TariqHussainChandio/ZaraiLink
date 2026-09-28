import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { ENV } from '../../config/env';
import { EncryptedStorage } from './encryptedStorage';

// ENV is validated at import time (frontend/config/env.ts), so a missing URL or key never reaches here.
export const supabase = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
  auth: {
    // P4 (4B.1): AES-256-CTR encrypted, key held in expo-secure-store — see encryptedStorage.ts.
    storage: EncryptedStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE (not the default implicit flow) so a password-reset/magic-link redirect carries a
    // `?code=...` query param instead of a `#access_token=...` fragment — the former integrates
    // with React Navigation's deep-linking, the latter doesn't. See authStore.ts, which exchanges
    // the code via `exchangeCodeForSession` and reacts to the resulting PASSWORD_RECOVERY event.
    flowType: 'pkce',
  },
});

// P4 (4B.1): supabase-js's own documented React Native pattern — auto-refresh only ticks while
// the app is in the foreground, so a backgrounded app doesn't burn battery/network refreshing a
// token nobody is using, and doesn't race a refresh attempt against the OS suspending the app.
AppState.addEventListener('change', state => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});