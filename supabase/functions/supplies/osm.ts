/**
 * OpenStreetMap for Spoor's "supplies" Edge Function: which areas ("tiles") a route passes
 * through, the Overpass query for them, and turning Overpass's answer into rows for the
 * supply_points and settlements tables.
 *
 * Plain TypeScript with no imports, so the Edge Function (Deno) and the app's tests (Jest)
 * both use this same file.
 */

// -- Tiles ------------------------------------------------------------------------------

/** Tiles are 0.25° squares, about 28 × 28 km in southern Africa. */
export const TILE_DEGREES = 0.25;

/** A tile's id, e.g. "-92:108": its row and column of 0.25° squares. Matches the tables' `tile` column. */
export function tileId(latitude: number, longitude: number): string {
  return `${Math.floor(latitude / TILE_DEGREES)}:${Math.floor(longitude / TILE_DEGREES)}`;
}

export const TILE_ID = /^-?\d{1,3}:-?\d{1,4}$/;

export function tileBounds(id: string): { south: number; west: number; north: number; east: number } {
  const [row, column] = id.split(':').map(Number);
  return {
    south: row * TILE_DEGREES,
    west: column * TILE_DEGREES,
    north: (row + 1) * TILE_DEGREES,
    east: (column + 1) * TILE_DEGREES,
  };
}

/** How far from a route places are looked for: supplies 10 km, plus a little for town names. */
export const ROUTE_CORRIDOR_KM = 11;

/** Every tile within `radiusKm` of a route (`[longitude, latitude]` points), in route order. */
export function tilesAlong(route: [number, number][], radiusKm = ROUTE_CORRIDOR_KM): string[] {
  const tiles = new Set<string>();
  const addAround = (lon: number, lat: number) => {
    const dLat = radiusKm / 110.574;
    const dLon = radiusKm / (111.32 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
    const [firstRow, firstColumn] = tileId(lat - dLat, lon - dLon).split(':').map(Number);
    const [lastRow, lastColumn] = tileId(lat + dLat, lon + dLon).split(':').map(Number);
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) tiles.add(`${row}:${column}`);
    }
  };
  // Look every couple of km along the route, so no tile it passes near is missed.
  const stepDegrees = 0.02;
  for (let i = 0; i < route.length; i++) {
    const [lon, lat] = route[i];
    addAround(lon, lat);
    const next = route[i + 1];
    if (!next) continue;
    const steps = Math.ceil(Math.max(Math.abs(next[0] - lon), Math.abs(next[1] - lat)) / stepDegrees);
    for (let step = 1; step < steps; step++) {
      addAround(lon + ((next[0] - lon) * step) / steps, lat + ((next[1] - lat) * step) / steps);
    }
  }
  return [...tiles];
}

// -- The Overpass query --------------------------------------------------------------------

/** A supply category as the query needs it, from the supply_categories table. */
export type CategoryTags = { id: string; label: string; osm_tags: string[] };

/**
 * An OpenStreetMap tag as an Overpass filter: "shop=butcher" → ["shop"="butcher"]. Only
 * plain keys and values are accepted, as tags come from the categories table.
 */
export function osmTagFilter(tag: string): string | undefined {
  const match = /^([a-z_:]+)=([a-z_:]+)$/i.exec(tag.trim());
  return match ? `["${match[1]}"="${match[2]}"]` : undefined;
}

const SETTLEMENT_KINDS = ['city', 'town', 'village'];

/** One Overpass query for every category's places, and town names, in some tiles. */
export function overpassTilesQuery(tiles: string[], categories: CategoryTags[]): string {
  const filters = [
    ...categories.flatMap((category) => category.osm_tags.map(osmTagFilter)).filter((f) => f !== undefined),
  ];
  const searches = tiles
    .map((tile) => {
      const { south, west, north, east } = tileBounds(tile);
      const box = `(${south},${west},${north},${east})`;
      return (
        filters.map((filter) => `nwr${filter}${box};`).join('') +
        `node["place"~"^(${SETTLEMENT_KINDS.join('|')})$"]["name"]${box};`
      );
    })
    .join('');
  return `[out:json][timeout:120];(${searches});out center tags;`;
}

// -- Overpass's answer as table rows -----------------------------------------------------------

/** Water points' kinds, kept in a place's details. */
export type WaterKindKey = 'drinking' | 'point' | 'tap' | 'well';

export type PointDetails = {
  brand?: string;
  /** False when OpenStreetMap has no name and `name` was made up (e.g. "Fuel"). */
  named?: boolean;
  /** The town in the address, when OpenStreetMap has one. */
  town?: string;
  water_kind?: WaterKindKey;
  /** Wells and springs: the water may need treating before drinking. */
  needs_treating?: boolean;
  /** Mapped as not drinkable (e.g. for washing or vehicles). */
  not_for_drinking?: boolean;
};

/** A row for the supply_points table. */
export type OsmPointRow = {
  category: string;
  name: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  opening_hours: string | null;
  source: 'OSM';
  osm_id: string;
  last_confirmed: string | null;
  details: PointDetails;
};

/** A row for the settlements table. */
export type SettlementRow = { osm_id: string; name: string; kind: string; latitude: number; longitude: number };

function waterDetails(tags: Record<string, string>): PointDetails {
  const water_kind: WaterKindKey =
    tags.amenity === 'drinking_water'
      ? 'drinking'
      : tags.amenity === 'water_point'
        ? 'point'
        : tags.man_made === 'water_tap'
          ? 'tap'
          : 'well';
  const source = (tags.water_source ?? '').toLowerCase();
  return {
    water_kind,
    needs_treating: water_kind === 'well' || tags.natural === 'spring' || source === 'well' || source === 'spring',
    not_for_drinking: tags.drinking_water === 'no',
  };
}

const metres = ([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]) => {
  const rad = Math.PI / 180;
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.hypot(x, y) * 6_371_000;
};

/**
 * Supply points and town names from an Overpass answer. Each place goes in the first category
 * (in the order given) whose tags it has. Places mapped twice, as a point and an area, within
 * 100 m with the same name and category are kept once.
 */
export function parseOverpass(response: any, categories: CategoryTags[]): { points: OsmPointRow[]; settlements: SettlementRow[] } {
  const points: OsmPointRow[] = [];
  const settlements: SettlementRow[] = [];
  for (const element of response?.elements ?? []) {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') continue;
    const tags: Record<string, string> = element.tags ?? {};
    const osm_id = `${element.type}/${element.id}`;

    if (tags.place && SETTLEMENT_KINDS.includes(tags.place) && tags.name) {
      settlements.push({ osm_id, name: tags.name, kind: tags.place, latitude, longitude });
      continue;
    }
    const category = categories.find((c) =>
      c.osm_tags.some((tag) => {
        const [key, value] = tag.split('=');
        return tags[key] === value;
      })
    );
    if (!category) continue;

    const name = tags.name || tags.brand || category.label;
    const duplicate = points.some(
      (other) =>
        other.category === category.id &&
        other.name === name &&
        metres([other.longitude, other.latitude], [longitude, latitude]) < 100
    );
    if (duplicate) continue;

    const checkDate = tags.check_date ?? tags.survey_date;
    const details: PointDetails = {
      ...(tags.brand && { brand: tags.brand }),
      named: !!tags.name,
      ...((tags['addr:city'] || tags['addr:place']) && { town: tags['addr:city'] || tags['addr:place'] }),
      ...(category.id === 'water' && waterDetails(tags)),
    };
    points.push({
      category: category.id,
      name: name.slice(0, 120),
      latitude,
      longitude,
      phone: (tags.phone || tags['contact:phone'] || '').slice(0, 40) || null,
      opening_hours: (tags.opening_hours || '').slice(0, 200) || null,
      source: 'OSM',
      osm_id,
      last_confirmed: checkDate && /^\d{4}-\d{2}-\d{2}$/.test(checkDate) ? checkDate : null,
      details,
    });
  }
  return { points, settlements };
}

// -- Asking Overpass -------------------------------------------------------------------------------

/**
 * Public Overpass servers, tried in order. They're often busy, and refuse requests that
 * don't say which app they come from.
 */
export const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const USER_AGENT = 'Spoor/1.0 (overland trip planner app; https://github.com/Xtofferson/Spoor)';
const TIMEOUT_MS = 120_000;

export class OverpassError extends Error {}

/** Runs an Overpass query, trying the next server when one is busy or answers with an error page. */
export async function fetchOverpass(query: string, fetchImpl: typeof fetch = fetch): Promise<any> {
  const body = `data=${encodeURIComponent(query)}`;
  for (const server of OVERPASS_SERVERS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(server, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
        body,
        signal: controller.signal,
      });
      // A busy server answers with an HTML or XML error page instead of JSON; try the next one.
      if (!response.ok) continue;
      const json = await response.json().catch(() => undefined);
      if (json?.elements) return json;
    } catch {
      // Timed out or refused: try the next server.
    } finally {
      clearTimeout(timer);
    }
  }
  throw new OverpassError('OpenStreetMap’s servers are busy. Try again in a few minutes.');
}
