// Tests must never reach real services: OpenRouteService has small daily quotas and
// Supabase holds real data. Tests that need responses replace fetch with their own.
globalThis.fetch = jest.fn(() => Promise.reject(new Error('Network access is disabled in tests')));

// A placeholder key, so code that checks for one runs; it's never sent anywhere.
process.env.EXPO_PUBLIC_ORS_KEY = 'test-key';
