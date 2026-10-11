// Tests must never reach real services: OpenRouteService has small daily quotas and
// Supabase holds real data. Tests that need responses replace fetch with their own.
globalThis.fetch = jest.fn(() => Promise.reject(new Error('Network access is disabled in tests')));

// Placeholders, so code that checks for them runs; nothing is ever sent anywhere.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-key';
