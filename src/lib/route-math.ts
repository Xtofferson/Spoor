/** Pure helpers for route planning, kept free of React Native so they can be tested on their own. */

/** `[longitude, latitude]`, the order OpenRouteService uses. */
export type LonLat = [number, number];

/** Great-circle distance in metres. */
export function distanceMeters(a: LonLat, b: LonLat): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

// -- Choosing the right geocoding result ------------------------------------

export type PlaceCandidate = {
  coordinates: LonLat;
  name: string;
  label: string;
  layer: string;
};

function normalizeName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 0 = same name, 1 = the stop name is a whole word in it ("Kubu Island Lodge"), 2 = anything else.
 * Only the part before a comma is compared, so "Nata, Botswana" matches a place named "Nata".
 */
function nameMatch(query: string, name: string) {
  const q = normalizeName(query.split(',')[0]);
  const n = normalizeName(name);
  if (n === q) return 0;
  return ` ${n} `.includes(` ${q} `) ? 1 : 2;
}

/** Towns and regions first, then named places such as lodges and parks, then suburbs and the like. */
function layerRank(layer: string) {
  if (['locality', 'localadmin', 'county', 'macrocounty', 'region', 'macroregion', 'country'].includes(layer)) {
    return 0;
  }
  return layer === 'venue' ? 1 : 2;
}

/**
 * Picks the most likely place for a stop name. Searches return many places with similar
 * names worldwide ("Nata" finds Panama first), so prefer: an exact name match, then towns
 * over businesses and suburbs, then whatever is closest to the previous stop on the route.
 * Returns undefined when nothing has a matching name.
 */
export function pickPlace(
  query: string,
  candidates: PlaceCandidate[],
  previous?: LonLat
): PlaceCandidate | undefined {
  const ranked = candidates
    .filter((candidate) => nameMatch(query, candidate.name) < 2)
    .map((candidate) => ({
      candidate,
      key: [
        nameMatch(query, candidate.name),
        layerRank(candidate.layer),
        previous ? distanceMeters(previous, candidate.coordinates) : 0,
      ],
    }));
  ranked.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2]);
  return ranked[0]?.candidate;
}

// -- Road surface -----------------------------------------------------------

/** One OpenRouteService extra-info section: points `from` to `to` share `value`. */
export type ExtraRange = [from: number, to: number, value: number];

export type SurfaceShares = {
  tar: number;
  gravel: number;
  unpaved: number;
  unknown: number;
};

// OpenRouteService surface codes.
const TAR = new Set([1, 3, 4, 5, 6, 7, 14]); // paved, asphalt, concrete, cobblestone, metal, wood, paving stones
const GRAVEL = new Set([8, 9, 10]); // compacted gravel, fine gravel, gravel
const UNPAVED = new Set([2, 11, 12, 13, 15, 16, 17, 18]); // unpaved, dirt, ground, ice, sand, woodchips, grass, grass paver
// OpenRouteService way types that are never tarred.
const UNPAVED_WAYS = new Set([4, 5]); // path, track

/** Expands ranges into one value per route edge (the stretch between point i and i + 1). */
function valuePerEdge(ranges: ExtraRange[], edgeCount: number): number[] {
  const values = new Array<number>(edgeCount).fill(0);
  for (const [from, to, value] of ranges) {
    for (let edge = from; edge < to && edge < edgeCount; edge++) values[edge] = value;
  }
  return values;
}

/**
 * Splits a route into tar, gravel, unpaved and unknown, as fractions that add up to 1.
 * Where OpenStreetMap has no surface for a road, a track or path is counted as unpaved;
 * anything else stays unknown rather than being guessed.
 */
export function surfaceShares(
  coordinates: LonLat[],
  surface: ExtraRange[],
  waytype: ExtraRange[]
): SurfaceShares {
  const edgeCount = Math.max(coordinates.length - 1, 0);
  const surfaces = valuePerEdge(surface, edgeCount);
  const ways = valuePerEdge(waytype, edgeCount);
  const meters: SurfaceShares = { tar: 0, gravel: 0, unpaved: 0, unknown: 0 };

  for (let edge = 0; edge < edgeCount; edge++) {
    const length = distanceMeters(coordinates[edge], coordinates[edge + 1]);
    const value = surfaces[edge];
    if (TAR.has(value)) meters.tar += length;
    else if (GRAVEL.has(value)) meters.gravel += length;
    else if (UNPAVED.has(value) || UNPAVED_WAYS.has(ways[edge])) meters.unpaved += length;
    else meters.unknown += length;
  }

  const total = meters.tar + meters.gravel + meters.unpaved + meters.unknown;
  if (total === 0) return { tar: 0, gravel: 0, unpaved: 0, unknown: 1 };
  return {
    tar: meters.tar / total,
    gravel: meters.gravel / total,
    unpaved: meters.unpaved / total,
    unknown: meters.unknown / total,
  };
}

// -- Formatting ---------------------------------------------------------------

export function formatDistance(meters: number) {
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString('en-US')} km`;
}

/** e.g. "17 h 52 min", or "45 min". */
export function formatDuration(seconds: number) {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

// -- Suggestions while typing a stop name -------------------------------------

/**
 * How well a name matches what was typed: 0 = the same, 1 = starts with it as whole words
 * ("Kubu Island" for "Kubu"), 2 = starts with it mid-word ("Kubuta"), 3 = a later word
 * starts with it, 4 = anything else.
 */
function typedMatch(query: string, name: string) {
  const q = normalizeName(query.split(',')[0]);
  const n = normalizeName(name);
  if (n === q) return 0;
  if (n.startsWith(`${q} `)) return 1;
  if (n.startsWith(q)) return 2;
  return ` ${n}`.includes(` ${q}`) ? 3 : 4;
}

/** How far from the previous stop counts as "nearby" for suggestions. */
export const NEARBY_KM = 2000;

/**
 * Merges suggestion lists from several searches and orders them: names that match what
 * was typed first, then places near the route, then towns before businesses and suburbs,
 * then shorter names (plain "Sossusvlei" before "Sossusvlei Desert Lodge"), then the
 * closest. Duplicates are dropped, and so are unrelated names when there are better ones.
 */
export function rankSuggestions(
  query: string,
  lists: PlaceCandidate[][],
  near?: LonLat,
  limit = 6
): PlaceCandidate[] {
  const seen = new Set<string>();
  const unique: PlaceCandidate[] = [];
  for (const candidate of lists.flat()) {
    if (seen.has(candidate.label)) continue;
    seen.add(candidate.label);
    unique.push(candidate);
  }

  const keyed = unique.map((candidate, order) => {
    const distance = near ? distanceMeters(near, candidate.coordinates) : 0;
    return {
      candidate,
      key: [
        typedMatch(query, candidate.name),
        distance <= NEARBY_KM * 1000 ? 0 : 1,
        layerRank(candidate.layer),
        normalizeName(candidate.name).length,
        distance,
        order,
      ],
    };
  });
  keyed.sort((a, b) => {
    for (let i = 0; i < a.key.length; i++) {
      if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
    }
    return 0;
  });

  const related = keyed.filter(({ key }) => key[0] < 4);
  return (related.length > 0 ? related : keyed).slice(0, limit).map(({ candidate }) => candidate);
}
