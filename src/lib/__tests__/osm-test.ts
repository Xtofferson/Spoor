import {
  fetchOverpass,
  OverpassError,
  osmTagFilter,
  overpassTilesQuery,
  parseOverpass,
  tileBounds,
  tileId,
  tilesAlong,
} from '../../../supabase/functions/supplies/osm';

import overpassFuel from './fixtures/overpass-polokwane-palapye-fuel.json';
import polokwanePalapye from './fixtures/ors-polokwane-palapye-fastest.json';

const categories = [
  { id: 'fuel', label: 'Fuel', osm_tags: ['amenity=fuel'] },
  { id: 'water', label: 'Water', osm_tags: ['amenity=drinking_water', 'man_made=water_well'] },
  { id: 'butcher', label: 'Butcher', osm_tags: ['shop=butcher'] },
  { id: 'vet_checkpoint', label: 'Veterinary checkpoint', osm_tags: [] },
];

describe('tiles', () => {
  it('names 0.25° squares by row and column, as the tables do', () => {
    // Palapye.
    expect(tileId(-22.5519, 27.1253)).toBe('-91:108');
    expect(tileBounds('-91:108')).toEqual({ south: -22.75, west: 27, north: -22.5, east: 27.25 });
  });

  it('finds every tile within 11 km of a route, and only those', () => {
    const route = polokwanePalapye.features[0].geometry.coordinates as [number, number][];
    const tiles = tilesAlong(route);
    // Both ends, and a ~320 km route touches a few dozen tiles, not a whole rectangle (~70).
    expect(tiles).toContain(tileId(-23.9045, 29.4486));
    expect(tiles).toContain(tileId(-22.5519, 27.1253));
    expect(tiles.length).toBeGreaterThan(15);
    expect(tiles.length).toBeLessThan(50);
  });

  it('includes a neighbouring tile when the route runs close to its edge', () => {
    // 2 km south of the line between rows -91 and -90.
    expect(tilesAlong([[27.1, -22.52]], 5)).toEqual(expect.arrayContaining(['-91:108', '-90:108']));
  });
});

describe('the Overpass query', () => {
  it('asks for every category’s tags, and town names, in each tile', () => {
    const query = overpassTilesQuery(['-91:108'], categories);
    expect(query).toMatch(/^\[out:json\]\[timeout:120\];\(/);
    expect(query).toContain('nwr["amenity"="fuel"](-22.75,27,-22.5,27.25);');
    expect(query).toContain('nwr["man_made"="water_well"](-22.75,27,-22.5,27.25);');
    expect(query).toContain('nwr["shop"="butcher"](-22.75,27,-22.5,27.25);');
    expect(query).toContain('node["place"~"^(city|town|village)$"]["name"](-22.75,27,-22.5,27.25);');
    // Checkpoints have no OpenStreetMap tags; travellers add them.
    expect(query).not.toContain('checkpoint');
  });

  it('only turns plain key=value tags into filters', () => {
    expect(osmTagFilter('shop=butcher')).toBe('["shop"="butcher"]');
    expect(osmTagFilter('shop=butcher"];out;')).toBeUndefined();
    expect(osmTagFilter('shop')).toBeUndefined();
  });
});

describe('Overpass’s answer as rows', () => {
  it('reads the real Polokwane → Palapye answer, including stations mapped as areas', () => {
    const { points } = parseOverpass(overpassFuel, categories);
    expect(points.length).toBeGreaterThan(40);
    expect(points.every((p) => p.category === 'fuel' && p.source === 'OSM')).toBe(true);
    expect(points.some((p) => p.osm_id.startsWith('way/'))).toBe(true);
  });

  it('keeps a place mapped twice (point and area) once', () => {
    const { points } = parseOverpass(
      {
        elements: [
          { type: 'node', id: 1, lat: -22.5, lon: 27.1, tags: { amenity: 'fuel', name: 'Engen' } },
          { type: 'way', id: 2, center: { lat: -22.5003, lon: 27.1002 }, tags: { amenity: 'fuel', name: 'Engen' } },
        ],
      },
      categories
    );
    expect(points).toHaveLength(1);
  });

  it('says what kind of water point it is, and whether to treat it', () => {
    const { points } = parseOverpass(
      {
        elements: [
          { type: 'node', id: 1, lat: -20, lon: 25, tags: { amenity: 'drinking_water', drinking_water: 'no' } },
          { type: 'node', id: 2, lat: -20.1, lon: 25, tags: { man_made: 'water_well', name: 'Borehole 7' } },
        ],
      },
      categories
    );
    expect(points.map((p) => p.details)).toEqual([
      { named: false, water_kind: 'drinking', needs_treating: false, not_for_drinking: true },
      { named: true, water_kind: 'well', needs_treating: true, not_for_drinking: false },
    ]);
  });

  it('keeps only real towns and villages with names', () => {
    const { settlements } = parseOverpass(
      {
        elements: [
          { type: 'node', id: 1, lat: -22.5, lon: 27.1, tags: { place: 'village', name: 'Serowe' } },
          { type: 'node', id: 2, lat: -22.6, lon: 27.2, tags: { place: 'suburb', name: 'Not a town' } },
        ],
      },
      categories
    );
    expect(settlements).toEqual([{ osm_id: 'node/1', name: 'Serowe', kind: 'village', latitude: -22.5, longitude: 27.1 }]);
  });
});

describe('asking Overpass', () => {
  type Reply = { status: number; json?: unknown; text?: string } | Error;

  /** Answers each request in turn, and records which servers were asked and how. */
  function serversReply(...replies: Reply[]) {
    const calls: { url: string; init: any }[] = [];
    const fetchImpl = jest.fn(async (url: string, init: any) => {
      calls.push({ url, init });
      const reply = replies[calls.length - 1];
      if (reply instanceof Error) throw reply;
      return {
        ok: reply.status < 400,
        status: reply.status,
        json: async () => (reply.json !== undefined ? reply.json : JSON.parse(reply.text ?? '')),
      };
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  }

  it('says which app is asking', async () => {
    const { calls, fetchImpl } = serversReply({ status: 200, json: overpassFuel });
    await fetchOverpass('[out:json];', fetchImpl);
    expect(calls[0].url).toBe('https://overpass-api.de/api/interpreter');
    expect(calls[0].init.headers['User-Agent']).toMatch(/^Spoor\//);
  });

  it('tries the next server when one is busy, refuses, or sends an error page instead of JSON', async () => {
    const busy = serversReply({ status: 504, text: '<html>busy</html>' }, { status: 200, json: overpassFuel });
    await expect(fetchOverpass('q', busy.fetchImpl)).resolves.toMatchObject({ elements: expect.any(Array) });
    expect(busy.calls.map((call) => new URL(call.url).host)).toEqual(['overpass-api.de', 'maps.mail.ru']);

    // Overpass answers "too busy" with HTTP 200 and an XML page.
    const page = serversReply(
      { status: 200, text: '<?xml version="1.0"?><osm3s>runtime error: too busy</osm3s>' },
      { status: 200, json: overpassFuel }
    );
    await expect(fetchOverpass('q', page.fetchImpl)).resolves.toMatchObject({ elements: expect.any(Array) });
  });

  it('says so clearly when every server fails', async () => {
    const { fetchImpl } = serversReply(new TypeError('Network request failed'), { status: 429, text: 'Too many' });
    await expect(fetchOverpass('q', fetchImpl)).rejects.toThrow(OverpassError);
  });
});
