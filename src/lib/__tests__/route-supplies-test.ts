import { fetchRouteSupplies, SuppliesError } from '../route-supplies';
import type { LonLat } from '../route-math';

import overpassFuel from './fixtures/overpass-polokwane-palapye-fuel.json';

jest.mock('@/lib/storage', () => ({
  storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

const route: LonLat[] = [
  [29.45, -23.9],
  [27.94, -23.0],
  [27.13, -22.55],
];

type Reply = { status: number; json?: unknown; text?: string } | Error;

/** Answers each Overpass request in turn, and records which servers were asked and how. */
function serversReply(...replies: Reply[]) {
  const calls: { url: string; init: any }[] = [];
  globalThis.fetch = jest.fn(async (url: string, init: any) => {
    calls.push({ url, init });
    const reply = replies[calls.length - 1];
    if (reply instanceof Error) throw reply;
    return {
      ok: reply.status < 400,
      status: reply.status,
      json: async () => (reply.json !== undefined ? reply.json : JSON.parse(reply.text ?? '')),
    };
  }) as unknown as typeof fetch;
  return calls;
}

describe('fetchRouteSupplies', () => {
  it('asks Overpass for fuel and water within 5 km of the route, saying which app is asking', async () => {
    const calls = serversReply({ status: 200, json: overpassFuel });
    const { fuel, water } = await fetchRouteSupplies(route);
    expect(fuel.length).toBeGreaterThan(40);
    expect(water).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://overpass-api.de/api/interpreter');
    expect(calls[0].init.headers['User-Agent']).toMatch(/^Spoor\//);
    expect(decodeURIComponent(calls[0].init.body)).toMatch(/nwr\["amenity"="fuel"\]\(around:5000,/);
    expect(decodeURIComponent(calls[0].init.body)).toMatch(/nwr\["man_made"="water_well"\]\(around:5000,/);
  });

  it('tries the next server when one is busy or refuses', async () => {
    const calls = serversReply({ status: 504, text: '<html>busy</html>' }, { status: 200, json: overpassFuel });
    await expect(fetchRouteSupplies(route)).resolves.toMatchObject({ fuel: expect.any(Array) });
    expect(calls.map((call) => new URL(call.url).host)).toEqual(['overpass-api.de', 'maps.mail.ru']);
  });

  it('tries the next server when one sends an error page instead of JSON', async () => {
    // Overpass answers "too busy" with HTTP 200 and an XML page.
    const calls = serversReply(
      { status: 200, text: '<?xml version="1.0"?><osm3s>runtime error: too busy</osm3s>' },
      { status: 200, json: overpassFuel }
    );
    await expect(fetchRouteSupplies(route)).resolves.toMatchObject({ fuel: expect.any(Array) });
    expect(calls).toHaveLength(2);
  });

  it('says so clearly when every server fails or the phone is offline', async () => {
    serversReply(new TypeError('Network request failed'), { status: 429, text: 'Too many requests' });
    await expect(fetchRouteSupplies(route)).rejects.toThrow(SuppliesError);
    serversReply(new TypeError('Network request failed'), new TypeError('Network request failed'));
    await expect(fetchRouteSupplies(route)).rejects.toThrow(/servers are busy or you’re offline/);
  });
});
