import { setAccessTokenSource } from '../api-auth';
import type { LonLat } from '../route-math';
import { fetchRouteSupplies, SuppliesError } from '../route-supplies';

import { tilesAlong } from '../../../supabase/functions/supplies/osm';

jest.mock('@/lib/storage', () => ({
  storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

type Reply = { status: number; json?: unknown } | Error;

/**
 * Answers the Edge Function and Supabase reads, and records what was asked. `functionReply`
 * answers each call to the supplies function in turn.
 */
function supabaseReplies({
  functionReplies = [],
  points = [],
  settlements = [],
}: {
  functionReplies?: Reply[];
  points?: unknown[];
  settlements?: unknown[];
}) {
  const calls: { url: string; init: any }[] = [];
  let functionCalls = 0;
  globalThis.fetch = jest.fn(async (url: string, init: any = {}) => {
    calls.push({ url, init });
    let reply: Reply;
    if (url.includes('/functions/v1/supplies')) {
      reply = functionReplies[functionCalls++] ?? { status: 200, json: { fetched: 0 } };
    } else if (url.includes('/rest/v1/supply_points')) {
      reply = { status: 200, json: points };
    } else {
      reply = { status: 200, json: settlements };
    }
    if (reply instanceof Error) throw reply;
    const { status, json } = reply;
    return { ok: status < 400, status, json: async () => json };
  }) as unknown as typeof fetch;
  return calls;
}

/** A route new to this test run, so no tiles are remembered as up to date. */
let shift = 0;
function newRoute(lengthDegrees = 1): LonLat[] {
  shift += 3;
  return [
    [20 + shift, -20],
    [20 + shift + lengthDegrees, -20],
  ];
}

const row = {
  id: 'uuid-1',
  category: 'fuel',
  name: 'Engen',
  latitude: -20,
  longitude: 24,
  phone: null,
  opening_hours: null,
  notes: null,
  photo_path: null,
  source: 'OSM',
  osm_id: 'node/1',
  last_confirmed: null,
  created_by: null,
  details: { brand: 'Engen', named: true },
  tile: '-80:96',
};

beforeEach(() => setAccessTokenSource(async () => 'user-token'));

describe('fetchRouteSupplies', () => {
  it('asks the Edge Function to bring the route’s tiles up to date, at most 20 at a time', async () => {
    const route = newRoute(3);
    const calls = supabaseReplies({});
    await fetchRouteSupplies(route);
    const sent = calls.filter((call) => call.url.includes('/functions/v1/supplies'));
    const tiles = tilesAlong(route);
    expect(tiles.length).toBeGreaterThan(20);
    expect(sent).toHaveLength(Math.ceil(tiles.length / 20));
    expect(JSON.parse(sent[0].init.body).tiles).toHaveLength(20);
    expect(sent[0].init.headers.Authorization).toBe('Bearer user-token');
    // Never OpenStreetMap directly.
    expect(calls.some((call) => call.url.includes('overpass'))).toBe(false);
  });

  it('reads the places and towns in exactly those tiles from Supabase', async () => {
    const route = newRoute();
    const calls = supabaseReplies({
      points: [row],
      settlements: [{ osm_id: 'node/9', name: 'Nata', kind: 'village', latitude: -20.2, longitude: 26.2 }],
    });
    const supplies = await fetchRouteSupplies(route);
    expect(supplies.points).toEqual([expect.objectContaining({ category: 'fuel', osmId: 'node/1', details: row.details })]);
    expect(supplies.settlements).toEqual([{ name: 'Nata', coordinates: [26.2, -20.2] }]);
    const read = calls.find((call) => call.url.includes('/rest/v1/supply_points'))!;
    const tile = tilesAlong(route)[0];
    expect(decodeURIComponent(read.url)).toContain(`tile=in.("${tile}"`);
    expect(read.init.headers.Authorization).toBe('Bearer user-token');
  });

  it('doesn’t ask about the same tiles again in the same session', async () => {
    const route = newRoute();
    supabaseReplies({});
    await fetchRouteSupplies(route);
    const calls = supabaseReplies({});
    await fetchRouteSupplies(route);
    expect(calls.some((call) => call.url.includes('/functions/v1/supplies'))).toBe(false);
  });

  it('still shows what Supabase has when OpenStreetMap is busy, and says it may be incomplete', async () => {
    supabaseReplies({ functionReplies: [{ status: 503, json: { error: { code: 'overpass-busy' } } }], points: [row] });
    const supplies = await fetchRouteSupplies(newRoute());
    expect(supplies.incomplete).toBe(true);
    expect(supplies.points).toHaveLength(1);
  });

  it('explains the daily limit, a missing sign-in, and being offline', async () => {
    supabaseReplies({ functionReplies: [{ status: 429, json: { error: { code: 'spoor-daily-limit' } } }] });
    await expect(fetchRouteSupplies(newRoute())).rejects.toThrow(/looked up a lot of routes today/);

    setAccessTokenSource(async () => undefined);
    await expect(fetchRouteSupplies(newRoute())).rejects.toThrow('Sign in again to see fuel, water and supplies.');

    setAccessTokenSource(async () => 'user-token');
    supabaseReplies({ functionReplies: [new TypeError('Network request failed')] });
    globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;
    await expect(fetchRouteSupplies(newRoute())).rejects.toThrow(SuppliesError);
  });
});
