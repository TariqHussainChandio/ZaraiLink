import Config from 'react-native-config';

export const ENV = {
  supabaseUrl: Config.SUPABASE_URL ?? '',
  supabaseAnonKey: Config.SUPABASE_ANON_KEY ?? '',
  apiBaseUrl: Config.API_BASE_URL ?? '',
  appEnv: Config.APP_ENV ?? 'development',
} as const;