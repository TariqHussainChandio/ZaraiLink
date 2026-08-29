import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { ENV } from '../../config/env';

if (!ENV.supabaseUrl) {
  throw new Error('SUPABASE_URL is missing from .env');
}

if (!ENV.supabaseAnonKey) {
  throw new Error('SUPABASE_ANON_KEY is missing from .env');
}

export const supabase = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});