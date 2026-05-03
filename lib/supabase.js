import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

const fallbackUrl = 'https://example.supabase.co';
const fallbackKey = 'missing-env-vars';

export const supabase = createClient(supabaseUrl ?? fallbackUrl, supabaseKey ?? fallbackKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // PKCE returns ?code=... on the redirect, which survives the
    // browser → exp:// deep-link handoff cleanly. Implicit-flow hash
    // fragments don't, and that's why Google sign-in stalled in Expo Go.
    flowType: 'pkce',
    // We do the URL detection ourselves in the login screen — leaving this
    // on would race with our explicit exchangeCodeForSession() call.
    detectSessionInUrl: false,
  },
});
