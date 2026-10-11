import { createClient } from '@supabase/supabase-js';

import { setAccessTokenSource } from '@/lib/api-auth';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Add them to .env and restart Expo.'
  );
}

// During static rendering there is no window, so sessions are only persisted in the browser.
const isBrowser = typeof window !== 'undefined';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isBrowser ? window.localStorage : undefined,
    autoRefreshToken: isBrowser,
    persistSession: isBrowser,
    detectSessionInUrl: isBrowser,
  },
});

// Edge Functions (e.g. OpenRouteService) are called with the signed-in user's token.
setAccessTokenSource(async () => (await supabase.auth.getSession()).data.session?.access_token);
