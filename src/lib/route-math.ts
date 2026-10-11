/** Pure helpers for route planning, kept free of React Native so they can be tested on their own. */
import { t } from './i18n';

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
 * Metres of tar, gravel, unpaved and unknown road between two points of a route
 * (the whole route by default). Where OpenStreetMap has no surface for a road, a track
 * or path is counted as unpaved; anything else stays unknown rather than being guessed.
 */
export function surfaceMeters(
  coordinates: LonLat[],
  surface: ExtraRange[],
  waytype: ExtraRange[],
  fromPoint = 0,
  toPoint = coordinates.length - 1
): SurfaceShares {
  const edgeCount = Math.max(coordinates.length - 1, 0);
  const surfaces = valuePerEdge(surface, edgeCount);
  const ways = valuePerEdge(waytype, edgeCount);
  const meters: SurfaceShares = { tar: 0, gravel: 0, unpaved: 0, unknown: 0 };

  for (let edge = Math.max(fromPoint, 0); edge < Math.min(toPoint, edgeCount); edge++) {
    const length = distanceMeters(coordinates[edge], coordinates[edge + 1]);
    const value = surfaces[edge];
    if (TAR.has(value)) meters.tar += length;
    else if (GRAVEL.has(value)) meters.gravel += length;
    else if (UNPAVED.has(value) || UNPAVED_WAYS.has(ways[edge])) meters.unpaved += length;
    else meters.unknown += length;
  }
  return meters;
}

/** Turns amounts (e.g. metres) of each surface into fractions that add up to 1. */
export function toShares(amounts: SurfaceShares): SurfaceShares {
  const total = amounts.tar + amounts.gravel + amounts.unpaved + amounts.unknown;
  if (total === 0) return { tar: 0, gravel: 0, unpaved: 0, unknown: 1 };
  return {
    tar: amounts.tar / total,
    gravel: amounts.gravel / total,
    unpaved: amounts.unpaved / total,
    unknown: amounts.unknown / total,
  };
}

/** The tar, gravel, unpaved and unknown split of a whole route, as fractions that add up to 1. */
export function surfaceShares(
  coordinates: LonLat[],
  surface: ExtraRange[],
  waytype: ExtraRange[]
): SurfaceShares {
  return toShares(surfaceMeters(coordinates, surface, waytype));
}

/** Combines the splits of several legs, weighting each by its length. */
export function combineShares(legs: { distance: number; surface: SurfaceShares }[]): SurfaceShares {
  const meters: SurfaceShares = { tar: 0, gravel: 0, unpaved: 0, unknown: 0 };
  for (const { distance, surface } of legs) {
    meters.tar += surface.tar * distance;
    meters.gravel += surface.gravel * distance;
    meters.unpaved += surface.unpaved * distance;
    meters.unknown += surface.unknown * distance;
  }
  return toShares(meters);
}

// -- Simplifying lines --------------------------------------------------------

/**
 * Drops points that sit within `toleranceMeters` of the line through their neighbours
 * (Douglas–Peucker), so a chosen route is small enough to save and sync. The shape on
 * the map stays the same at any zoom you'd use for a leg.
 */
export function simplifyLine(points: LonLat[], toleranceMeters = 25): LonLat[] {
  if (points.length <= 2) return points;
  // Flatten to metres around the line's middle latitude; fine over a leg's distances.
  const midLat = (points[0][1] + points[points.length - 1][1]) / 2;
  const mPerLon = 111_320 * Math.cos((midLat * Math.PI) / 180);
  const mPerLat = 110_540;
  const xy = points.map(([lon, lat]) => [lon * mPerLon, lat * mPerLat]);

  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    const [ax, ay] = xy[first];
    const [bx, by] = xy[last];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    let farthest = -1;
    let farthestDistance = toleranceMeters;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = xy[i];
      // Distance from the point to the segment between first and last.
      const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
      const distance = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (distance > farthestDistance) {
        farthest = i;
        farthestDistance = distance;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

// -- Describing route alternatives --------------------------------------------

/** A route chosen for one leg, saved with the trip on the stop the leg arrives at. */
export type ChosenRoute = {
  /** Where the leg started and ended when it was chosen; the choice only applies while they match. */
  from: LonLat;
  to: LonLat;
  /** e.g. "Via B300". */
  name: string;
  distance: number;
  duration: number;
  surface: SurfaceShares;
  /** Simplified, so it's small enough to sync. */
  geometry: LonLat[];
};

/** Whether a saved choice still fits a leg: both ends within a kilometre of where they were. */
export function choiceFitsLeg(choice: ChosenRoute, from: LonLat, to: LonLat) {
  return distanceMeters(choice.from, from) <= 1000 && distanceMeters(choice.to, to) <= 1000;
}

/**
 * Names each route after the road that most sets it apart from the others, e.g. "Via B300"
 * for a detour the other routes don't take. `roads` holds, per route, metres driven on each
 * named road. A route with no road clearly its own gets undefined.
 */
export function distinctiveRoads(roads: Record<string, number>[]): (string | undefined)[] {
  return roads.map((own, index) => {
    let best: string | undefined;
    let bestMargin = 1000; // A road has to set a route apart by at least a kilometre.
    for (const [name, meters] of Object.entries(own)) {
      const elsewhere = Math.max(0, ...roads.filter((_, other) => other !== index).map((r) => r[name] ?? 0));
      const margin = roads.length === 1 ? meters : meters - elsewhere;
      if (margin > bestMargin) {
        best = name;
        bestMargin = margin;
      }
    }
    return best;
  });
}

export type RouteTag = {
  text: string;
  /** good = reassuring, warn = worth knowing before choosing, plain = neutral. */
  kind: 'good' | 'warn' | 'plain';
};

/** Short facts about a route compared with the others, all taken from the route data. */
export function routeTags(
  route: { distance: number; duration: number; surface: SurfaceShares },
  all: { distance: number; duration: number }[]
): RouteTag[] {
  const tags: RouteTag[] = [];
  if (all.length > 1 && route.duration === Math.min(...all.map((r) => r.duration))) {
    tags.push({ text: t('routeOptions.fastest'), kind: 'plain' });
  }
  if (all.length > 1 && route.distance === Math.min(...all.map((r) => r.distance))) {
    tags.push({ text: t('routeOptions.shortest'), kind: 'plain' });
  }
  const km = (share: number) => Math.round((share * route.distance) / 1000);
  if (km(route.surface.unpaved) > 0) tags.push({ text: t('routeOptions.kmUnpaved', { km: km(route.surface.unpaved) }), kind: 'warn' });
  if (km(route.surface.gravel) > 0) tags.push({ text: t('routeOptions.kmGravel', { km: km(route.surface.gravel) }), kind: 'plain' });
  if (route.surface.tar > 0.995) tags.push({ text: t('routeOptions.allTar'), kind: 'good' });
  if (km(route.surface.unknown) >= 5) tags.push({ text: t('routeOptions.kmUnknown', { km: km(route.surface.unknown) }), kind: 'plain' });
  return tags;
}

/** ORS only offers its built-in alternative routes between points this close in a straight line. */
export const MAX_ALTERNATIVES_STRAIGHT_LINE_METERS = 100_000;

/** ORS only routes around areas (avoid_polygons) between points this close in a straight line. */
export const MAX_AVOID_AREAS_STRAIGHT_LINE_METERS = 150_000;

/** ORS country codes, in `[from, to, country]` sections like the other extra info. */
export type CountrySections = ExtraRange[];

/** Where a route first changes country, as a point on it, or undefined if it stays in one. */
export function firstBorderCrossing(geometry: LonLat[], countries: CountrySections): LonLat | undefined {
  for (let i = 1; i < countries.length; i++) {
    if (countries[i][2] !== countries[i - 1][2]) return geometry[countries[i][0]];
  }
  return undefined;
}

/** A GeoJSON octagon about `radiusMeters` around a point, for ORS's avoid_polygons. */
export function areaAround([lon, lat]: LonLat, radiusMeters = 3000) {
  const dLat = radiusMeters / 110_540;
  const dLon = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: LonLat[] = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * 2 * Math.PI;
    return [lon + dLon * Math.cos(angle), lat + dLat * Math.sin(angle)];
  });
  return { type: 'Polygon' as const, coordinates: [[...ring, ring[0]]] };
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
  if (hours === 0) return t('units.minutes', { minutes });
  return minutes === 0 ? t('units.hours', { hours }) : t('units.hoursMinutes', { hours, minutes });
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

/**
 * The share of route `a`'s length that runs within `toleranceMeters` of route `b`, from 0
 * to 1. Samples `a` about every 200 m and measures to the nearest part of `b`.
 */
export function sharedFraction(a: LonLat[], b: LonLat[], toleranceMeters = 75): number {
  if (a.length < 2 || b.length < 2) return 0;
  // Flatten to metres around the routes' middle latitude; fine over a leg's distances.
  const midLat = (a[0][1] + a[a.length - 1][1]) / 2;
  const mPerLon = 111_320 * Math.cos((midLat * Math.PI) / 180);
  const mPerLat = 110_540;
  const flat = (points: LonLat[]) => points.map(([lon, lat]) => [lon * mPerLon, lat * mPerLat] as const);
  const fa = flat(a);
  const fb = flat(b);

  // Bucket b's segments into a grid, so each sample only checks segments nearby.
  const cell = 1000;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < fb.length - 1; i++) {
    const [x1, y1] = fb[i];
    const [x2, y2] = fb[i + 1];
    for (let gx = Math.floor(Math.min(x1, x2) / cell) - 1; gx <= Math.floor(Math.max(x1, x2) / cell) + 1; gx++) {
      for (let gy = Math.floor(Math.min(y1, y2) / cell) - 1; gy <= Math.floor(Math.max(y1, y2) / cell) + 1; gy++) {
        const key = `${gx},${gy}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(i);
        else grid.set(key, [i]);
      }
    }
  }
  const nearB = (x: number, y: number) => {
    for (const i of grid.get(`${Math.floor(x / cell)},${Math.floor(y / cell)}`) ?? []) {
      const [ax, ay] = fb[i];
      const [bx, by] = fb[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
      if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= toleranceMeters) return true;
    }
    return false;
  };

  let total = 0;
  let shared = 0;
  for (let i = 0; i < fa.length - 1; i++) {
    const [x1, y1] = fa[i];
    const [x2, y2] = fa[i + 1];
    const length = Math.hypot(x2 - x1, y2 - y1);
    const samples = Math.max(1, Math.ceil(length / 200));
    for (let s = 0; s < samples; s++) {
      const t = (s + 0.5) / samples;
      total += length / samples;
      if (nearB(x1 + t * (x2 - x1), y1 + t * (y2 - y1))) shared += length / samples;
    }
  }
  return total === 0 ? 0 : shared / total;
}

/** Keeps the first of any routes that are practically the same (see nearlyIdentical). */
export function withoutNearlyIdentical<T extends { distance: number; geometry: LonLat[] }>(routes: T[]): T[] {
  const kept: T[] = [];
  for (const route of routes) {
    if (!kept.some((other) => nearlyIdentical(other, route))) kept.push(route);
  }
  return kept;
}

/**
 * Whether two routes are practically the same: less than 5% apart in distance and more than
 * 90% of the road in common (measured both ways, so a short detour still counts as different).
 */
export function nearlyIdentical(
  a: { distance: number; geometry: LonLat[] },
  b: { distance: number; geometry: LonLat[] }
): boolean {
  if (Math.abs(a.distance - b.distance) >= 0.05 * Math.max(a.distance, b.distance)) return false;
  return Math.min(sharedFraction(a.geometry, b.geometry), sharedFraction(b.geometry, a.geometry)) > 0.9;
}
