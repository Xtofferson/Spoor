import { setAccessTokenSource } from '../api-auth';
import { applyChosenRoutes, fetchRouteOptions, type RoutePlan } from '../route-plan';
import type { LonLat } from '../route-math';

import nataKubu from './fixtures/ors-nata-kubu-alternatives.json';
import palapyeLetlFastest from './fixtures/ors-palapye-letlhakane-fastest.json';
import palapyeLetlShortest from './fixtures/ors-palapye-letlhakane-shortest.json';
import polokwaneFastest from './fixtures/ors-polokwane-palapye-fastest.json';
import polokwaneShortest from './fixtures/ors-polokwane-palapye-shortest.json';

jest.mock('@/lib/storage', () => {
  const saved = new Map<string, string>();
  return {
    storage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, value),
      removeItem: (key: string) => void saved.delete(key),
    },
  };
});

// Signed in, as OpenRouteService is reached through Spoor's Edge Function with the user's token.
beforeEach(() => setAccessTokenSource(async () => 'user-token'));

type Reply = { status: number; body: unknown };

/** Every request sent, with where it went and its headers. */
let sent: { url: string; headers: Record<string, string> }[] = [];

/** Answers directions requests from saved responses, and records what was asked. */
function answerWith(reply: (request: any) => Reply) {
  const requests: any[] = [];
  sent = [];
  globalThis.fetch = jest.fn(async (url: string, init: { body: string; headers: Record<string, string> }) => {
    const request = JSON.parse(init.body);
    requests.push(request);
    sent.push({ url, headers: init.headers });
    const { status, body } = reply(request);
    return { ok: status < 400, status, json: async () => body };
  }) as unknown as typeof fetch;
  return requests;
}

const ok = (body: unknown): Reply => ({ status: 200, body });
const orsError = (status: number, code: number, message: string): Reply => ({ status, body: { error: { code, message } } });

const nata: LonLat = [26.18333, -20.21667];
const kubu: LonLat = [25.823, -20.894];
const palapye: LonLat = [27.1253, -22.5519];
const letlhakane: LonLat = [25.5925, -21.4152];
const polokwane: LonLat = [29.4486, -23.9045];
const lephalale: LonLat = [27.7, -23.67]; // 138 km from Palapye, across the border

const summary = (options: { name: string; tags: { text: string }[] }[]) =>
  options.map((option) => [option.name, option.tags.map((tag) => tag.text)]);

describe('fetchRouteOptions', () => {
  it('uses the built-in alternatives for a leg whose ends are within 100 km', async () => {
    const requests = answerWith(() => ok(nataKubu));
    const { options } = await fetchRouteOptions(nata, kubu);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ coordinates: [nata, kubu], alternative_routes: { target_count: 3 } });
    expect(requests[0].preference).toBeUndefined();
    // ORS returned three, two of which are the same road.
    expect(summary(options)).toEqual([
      ['Via A30', ['Fastest', 'Shortest', '85 km unpaved', '14 km surface unknown']],
      ['Via B300', ['32 km unpaved', '14 km surface unknown']],
    ]);
  });

  it('asks for fastest and shortest on longer legs, and keeps one when they’re the same road', async () => {
    const requests = answerWith((request) =>
      ok(request.preference === 'fastest' ? palapyeLetlFastest : palapyeLetlShortest)
    );
    const { options, notes } = await fetchRouteOptions(palapye, letlhakane);
    expect(requests.map((r) => r.preference).sort()).toEqual(['fastest', 'shortest']);
    expect(requests.every((r) => !r.alternative_routes && r.extra_info.includes('countryinfo'))).toBe(true);
    expect(options.map((option) => option.name)).toEqual(['Via A14']);
    expect(notes).toEqual([expect.stringMatching(/practically the same road/)]);
  });

  it('explains instead of failing when a border leg is too long to avoid the crossing', async () => {
    const requests = answerWith((request) => ok(request.preference === 'fastest' ? polokwaneFastest : polokwaneShortest));
    const { options, notes } = await fetchRouteOptions(polokwane, palapye);
    expect(requests).toHaveLength(2);
    expect(options).toHaveLength(2);
    expect(notes).toEqual([expect.stringMatching(/within 150 km.*281 km apart/s)]);
  });

  it('avoids the fastest route’s border crossing on border legs within 150 km', async () => {
    const requests = answerWith((request) =>
      ok(request.options?.avoid_polygons ? nataKubu : request.preference === 'fastest' ? polokwaneFastest : polokwaneShortest)
    );
    const { options } = await fetchRouteOptions(lephalale, palapye);
    const avoid = requests.find((r) => r.options?.avoid_polygons);
    const ring: LonLat[] = avoid.options.avoid_polygons.coordinates[0];
    const centre = ring.slice(0, -1).reduce(([x, y], [px, py]) => [x + px / 8, y + py / 8], [0, 0]);
    // Martin's Drift, where the fastest route crosses.
    expect(centre[0]).toBeCloseTo(27.941, 3);
    expect(centre[1]).toBeCloseTo(-22.998, 3);
    // One route per variant, at most three, the third tagged as a different crossing.
    expect(options).toHaveLength(3);
    expect(options[2].tags[0].text).toBe('Different border crossing');
  });

  it('still returns the other routes when the border variant fails', async () => {
    answerWith((request) =>
      request.options?.avoid_polygons
        ? orsError(404, 2010, 'Could not find routable point')
        : ok(request.preference === 'fastest' ? polokwaneFastest : polokwaneShortest)
    );
    const { options, notes } = await fetchRouteOptions(lephalale, palapye);
    expect(options).toHaveLength(2);
    expect(notes.join()).toMatch(/different border crossing/);
  });

  it('turns OpenRouteService’s limit errors into clear messages', async () => {
    answerWith(() =>
      orsError(400, 2004, 'The approximated route distance must not be greater than 100000.0 meters for use with the alternative Routes algorithm.')
    );
    await expect(fetchRouteOptions(nata, kubu)).rejects.toThrow(/OpenRouteService limit/);

    answerWith(() => ({ status: 403, body: { error: 'Quota exceeded' } }));
    await expect(fetchRouteOptions(nata, kubu)).rejects.toThrow(/free daily limit/);
  });

  it('says so when OpenRouteService can’t be reached', async () => {
    globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;
    await expect(fetchRouteOptions(nata, kubu)).rejects.toThrow(/Couldn’t reach OpenRouteService/);
  });
});

describe('applyChosenRoutes', () => {
  const geometry = nataKubu.features[0].geometry.coordinates as LonLat[];
  const middle = Math.floor(geometry.length / 2);
  const surface = (tar: number, unpaved: number) => ({ tar, gravel: 0, unpaved, unknown: 0 });
  const plan: RoutePlan = {
    stops: [
      { stopId: 'a', name: 'A', label: '', coordinates: geometry[0] },
      { stopId: 'b', name: 'B', label: '', coordinates: geometry[middle] },
      { stopId: 'c', name: 'C', label: '', coordinates: geometry[geometry.length - 1] },
    ],
    geometry,
    legs: [
      { from: 'A', to: 'B', distance: 100_000, duration: 3600, surface: surface(1, 0), points: [0, middle] },
      { from: 'B', to: 'C', distance: 50_000, duration: 3600, surface: surface(0, 1), points: [middle, geometry.length - 1] },
    ],
  };
  const choice = {
    from: geometry[middle],
    to: geometry[geometry.length - 1],
    name: 'Via B300',
    distance: 150_000,
    duration: 7200,
    surface: surface(1, 0),
    geometry: [geometry[middle], geometry[geometry.length - 1]],
  };
  const tripWith = (route?: typeof choice) =>
    ({ stops: [{ id: 'a' }, { id: 'b' }, { id: 'c', route }] }) as any;

  it('shows the planned route, split into legs, when nothing was chosen', () => {
    const shown = applyChosenRoutes(plan, tripWith());
    expect(shown.distance).toBe(150_000);
    expect(shown.legs[0].geometry).toHaveLength(middle + 1);
    expect(shown.legs[1].chosen).toBeUndefined();
    expect(shown.surface.tar).toBeCloseTo(2 / 3);
  });

  it('swaps in a chosen route and recalculates the totals', () => {
    const shown = applyChosenRoutes(plan, tripWith(choice));
    expect(shown.legs[1].chosen).toBe('Via B300');
    expect(shown.distance).toBe(250_000);
    expect(shown.duration).toBe(10_800);
    expect(shown.surface.tar).toBe(1);
  });

  it('ignores a choice once the leg’s stop has moved', () => {
    const moved = { ...choice, to: [choice.to[0] + 0.05, choice.to[1]] as LonLat };
    const shown = applyChosenRoutes(plan, tripWith(moved));
    expect(shown.legs[1].chosen).toBeUndefined();
    expect(shown.distance).toBe(150_000);
  });
});

describe('reaching OpenRouteService', () => {
  it('goes through Spoor’s Edge Function with the user’s token, never an OpenRouteService key', async () => {
    answerWith(() => ok(nataKubu));
    await fetchRouteOptions(nata, kubu);
    expect(sent[0].url).toBe('https://test.supabase.co/functions/v1/ors/v2/directions/driving-car/geojson');
    expect(sent[0].headers.Authorization).toBe('Bearer user-token');
    expect(sent[0].headers.apikey).toBeUndefined();
  });

  it('asks to sign in again when there’s no session', async () => {
    setAccessTokenSource(async () => undefined);
    answerWith(() => ok(nataKubu));
    await expect(fetchRouteOptions(nata, kubu)).rejects.toThrow('Sign in again to plan routes.');
    expect(sent).toEqual([]);
  });

  it('explains Spoor’s own daily limit per account', async () => {
    answerWith(() => ({ status: 429, body: { error: { code: 'spoor-daily-limit', message: 'Daily limit' } } }));
    await expect(fetchRouteOptions(nata, kubu)).rejects.toThrow(/planned a lot of routes today/);
  });
});
