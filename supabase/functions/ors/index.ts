// OpenRouteService for the Spoor app. The OpenRouteService key stays here, as the secret
// ORS_API_KEY, instead of inside the app where anyone could copy it. Only signed-in users
// can call it, each up to a daily limit, and only for the requests the app makes.
//
// The app calls e.g. POST /functions/v1/ors/v2/directions/driving-car/geojson and gets
// OpenRouteService's answer back unchanged.
import { withSupabase } from 'npm:@supabase/server@1';

const ORS_URL = 'https://api.openrouteservice.org';

/** The OpenRouteService requests the app makes, and each one's daily limit per user. */
const ALLOWED: Record<string, { service: string; dailyLimit: number }> = {
  '/v2/directions/driving-car/geojson': { service: 'ors-routes', dailyLimit: 150 },
  '/geocode/search': { service: 'ors-places', dailyLimit: 150 },
  '/geocode/reverse': { service: 'ors-places', dailyLimit: 150 },
  // OpenRouteService allows only about 100 suggestion lookups a day for the whole app.
  '/geocode/autocomplete': { service: 'ors-suggestions', dailyLimit: 30 },
};

function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const url = new URL(req.url);
    // The function is reached at /ors/..., or /functions/v1/ors/... when run locally.
    const path = url.pathname.replace(/^(\/functions\/v1)?\/ors/, '');
    const allowed = ALLOWED[path];
    if (!allowed || (req.method !== 'GET' && req.method !== 'POST')) {
      return error(404, 'not-allowed', 'This OpenRouteService request isn’t available.');
    }

    const { data: withinLimit, error: quotaError } = await ctx.supabase.rpc('use_api_quota', {
      p_service: allowed.service,
      p_limit: allowed.dailyLimit,
    });
    if (quotaError) return error(500, 'quota-check-failed', quotaError.message);
    if (!withinLimit) return error(429, 'spoor-daily-limit', 'Daily limit for this account reached.');

    const key = Deno.env.get('ORS_API_KEY');
    if (!key) return error(500, 'missing-key', 'ORS_API_KEY isn’t set for this function.');

    const response = await fetch(`${ORS_URL}${path}${url.search}`, {
      method: req.method,
      headers: {
        Authorization: key,
        'Content-Type': 'application/json',
        Accept: req.headers.get('Accept') ?? 'application/json, application/geo+json',
      },
      body: req.method === 'POST' ? await req.text() : undefined,
    });
    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
    });
  }),
};
