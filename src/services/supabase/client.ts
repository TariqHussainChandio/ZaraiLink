import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { ENV } from '../../config/env';

// ENV is validated at import time (src/config/env.ts), so a missing URL or key never reaches here.
export const supabase = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
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