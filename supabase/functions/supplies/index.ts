// Fuel, water, butcheries, firewood and town names from OpenStreetMap, for the Spoor app.
//
// The app sends the tiles (0.25° squares) its route passes through. Tiles not looked up in
// the last 30 days are fetched from Overpass here, once for everyone, and saved in the
// supply_points and settlements tables, which the app then reads. Phones never call
// Overpass themselves.
//
// POST /functions/v1/supplies   { "tiles": ["-92:108", "-92:109"] }   (at most 20 tiles)
import { withSupabase } from 'npm:@supabase/server@1';

import { fetchOverpass, OverpassError, overpassTilesQuery, parseOverpass, TILE_ID } from './osm.ts';

const MAX_TILES = 20;
const FRESH_DAYS = 30;
/** Calls per user per day; each covers up to 20 tiles (about 280 km of route). */
const DAILY_LIMIT = 200;

function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return error(405, 'method', 'Use POST.');
    const body = await req.json().catch(() => null);
    const asked: unknown[] = Array.isArray(body?.tiles) ? body.tiles : [];
    const tiles = [...new Set(asked.filter((tile): tile is string => typeof tile === 'string' && TILE_ID.test(tile)))];
    if (tiles.length === 0 || tiles.length > MAX_TILES) {
      return error(400, 'tiles', `Send between 1 and ${MAX_TILES} tiles.`);
    }

    const { data: withinLimit, error: quotaError } = await ctx.supabase.rpc('use_api_quota', {
      p_service: 'supplies',
      p_limit: DAILY_LIMIT,
    });
    if (quotaError) return error(500, 'quota-check-failed', quotaError.message);
    if (!withinLimit) return error(429, 'spoor-daily-limit', 'Daily limit for this account reached.');

    const admin = ctx.supabaseAdmin;
    const cutoff = new Date(Date.now() - FRESH_DAYS * 86_400_000).toISOString();
    const { data: fresh, error: freshError } = await admin
      .from('osm_tiles')
      .select('id')
      .in('id', tiles)
      .gt('fetched_at', cutoff);
    if (freshError) return error(500, 'tiles-read-failed', freshError.message);
    const known = new Set((fresh ?? []).map((row: { id: string }) => row.id));
    const missing = tiles.filter((tile) => !known.has(tile));
    if (missing.length === 0) return Response.json({ fetched: 0, points: 0 });

    const { data: categories, error: categoriesError } = await admin
      .from('supply_categories')
      .select('id, label, osm_tags')
      .order('sort');
    if (categoriesError) return error(500, 'categories-read-failed', categoriesError.message);

    let answer;
    try {
      answer = await fetchOverpass(overpassTilesQuery(missing, categories ?? []));
    } catch (e) {
      const message = e instanceof OverpassError ? e.message : 'OpenStreetMap couldn’t be reached.';
      return error(503, 'overpass-busy', message);
    }
    const { points, settlements } = parseOverpass(answer, categories ?? []);
    const startedAt = new Date().toISOString();

    if (settlements.length > 0) {
      const { error: e } = await admin.from('settlements').upsert(settlements, { onConflict: 'osm_id' });
      if (e) return error(500, 'settlements-write-failed', e.message);
    }
    if (points.length > 0) {
      const rows = points.map((point) => ({ ...point, osm_seen_at: startedAt }));
      const { error: e } = await admin.from('supply_points').upsert(rows, { onConflict: 'osm_id' });
      if (e) return error(500, 'points-write-failed', e.message);
    }
    // Places no longer on OpenStreetMap in these tiles are removed; travellers' own places stay.
    const { error: staleError } = await admin
      .from('supply_points')
      .delete()
      .eq('source', 'OSM')
      .in('tile', missing)
      .or(`osm_seen_at.is.null,osm_seen_at.lt.${startedAt}`);
    if (staleError) return error(500, 'cleanup-failed', staleError.message);

    const { error: tilesError } = await admin
      .from('osm_tiles')
      .upsert(missing.map((id) => ({ id, fetched_at: startedAt })), { onConflict: 'id' });
    if (tilesError) return error(500, 'tiles-write-failed', tilesError.message);

    return Response.json({ fetched: missing.length, points: points.length });
  }),
};
