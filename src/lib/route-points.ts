/**
 * Places along a route (fuel stations, water points): where they are along it, grouping
 * nearby ones into stops, the stretches between stops, and finding them on OpenStreetMap.
 * Pure functions only, so they can be tested without a phone or a network.
 */
import { distanceMeters, simplifyLine, type LonLat, type SurfaceShares } from './route-math';

// -- Positions along a route ------------------------------------------------------

/** A leg of the route as planning along it needs it. */
export type LineLeg = {
  from: string;
  to: string;
  /** Metres, as OpenRouteService measured it. */
  distance: number;
  /** Seconds of driving, as OpenRouteService estimated it. */
  duration?: number;
  surface: SurfaceShares;
  geometry: LonLat[];
};

/**
 * A route laid out as one line with the distance along it at every point. Each leg's
 * measured length is scaled to the distance OpenRouteService gave, so positions add up
 * to the same totals shown elsewhere.
 */
export type RouteLine = {
  points: LonLat[];
  /** Kilometres from the start at each point. */
  km: number[];
  legs: { from: string; to: string; startKm: number; endKm: number; surface: SurfaceShares; hours: number }[];
  totalKm: number;
};

export function buildRouteLine(legs: LineLeg[]): RouteLine {
  const points: LonLat[] = [];
  const km: number[] = [];
  const placed: RouteLine['legs'] = [];
  let startKm = 0;

  for (const leg of legs) {
    const legKm = leg.distance / 1000;
    let measured = 0;
    for (let i = 1; i < leg.geometry.length; i++) measured += distanceMeters(leg.geometry[i - 1], leg.geometry[i]);
    const scale = measured > 0 ? legKm / (measured / 1000) : 0;

    let along = startKm;
    leg.geometry.forEach((point, i) => {
      if (i > 0) along += (distanceMeters(leg.geometry[i - 1], point) / 1000) * scale;
      // Legs meet at a stop; don't repeat that point.
      if (i === 0 && points.length > 0) return;
      points.push(point);
      km.push(along);
    });
    placed.push({
      from: leg.from,
      to: leg.to,
      startKm,
      endKm: startKm + legKm,
      surface: leg.surface,
      hours: (leg.duration ?? 0) / 3600,
    });
    startKm += legKm;
  }
  return { points, km, legs: placed, totalKm: startKm };
}

/** Where a point is relative to the route: how far along it, and how far off it, in km. */
export function locateOnRoute(line: RouteLine, point: LonLat): { alongKm: number; offRouteKm: number } {
  // Flatten to metres around the point; fine for the few kilometres that matter here.
  const mPerLon = 111_320 * Math.cos((point[1] * Math.PI) / 180);
  const mPerLat = 110_540;
  const px = point[0] * mPerLon;
  const py = point[1] * mPerLat;
  let best = { alongKm: 0, offRouteKm: Infinity };
  for (let i = 0; i < line.points.length - 1; i++) {
    const ax = line.points[i][0] * mPerLon;
    const ay = line.points[i][1] * mPerLat;
    const dx = line.points[i + 1][0] * mPerLon - ax;
    const dy = line.points[i + 1][1] * mPerLat - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
    const off = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) / 1000;
    if (off < best.offRouteKm) {
      best = { alongKm: line.km[i] + t * (line.km[i + 1] - line.km[i]), offRouteKm: off };
    }
  }
  return best;
}

/** Driving hours between two points along the route, from each leg's estimated time. */
export function hoursBetween(line: RouteLine, startKm: number, endKm: number): number {
  let hours = 0;
  for (const leg of line.legs) {
    const length = leg.endKm - leg.startKm;
    const overlap = Math.min(endKm, leg.endKm) - Math.max(startKm, leg.startKm);
    if (overlap > 0 && length > 0) hours += (overlap / length) * leg.hours;
  }
  return hours;
}

/** Where each trip stop is along the route, in km: the start of each leg, then the end. */
export function tripStopsAlong(line: RouteLine): { name: string; km: number }[] {
  if (line.legs.length === 0) return [];
  return [
    ...line.legs.map((leg) => ({ name: leg.from, km: leg.startKm })),
    { name: line.legs[line.legs.length - 1].to, km: line.totalKm },
  ];
}

// -- Places and stops along the route ------------------------------------------------

/** Something found on OpenStreetMap near the route. */
export type Place = {
  id: string;
  coordinates: LonLat;
  name?: string;
  brand?: string;
  /** The town in the address, when OpenStreetMap has one. */
  town?: string;
};

/** Search radius around the route, as asked: within 5 km of the route line. */
export const SEARCH_RADIUS_METERS = 5000;

/** Places close together along the route (e.g. a town's several garages) form one stop. */
export const STOP_SPREAD_KM = 3;
/** A stop this close to a trip stop is named after it. */
const NAMED_AFTER_TRIP_STOP_KM = 15;
/** Neighbouring stops with the same name this close together are one stop. */
const MERGE_SAME_NAME_KM = 15;
/** Else it's named after the nearest town or village this close to one of its places. */
const NAMED_AFTER_SETTLEMENT_KM = 6;

/** A city, town or village near the route, used to name stops. */
export type Settlement = {
  name: string;
  coordinates: LonLat;
};

/** The settlement nearest to any of the places, if one is close enough to name them after. */
function nearestSettlement(places: Place[], settlements: Settlement[]): string | undefined {
  let best: { name: string; meters: number } | undefined;
  for (const settlement of settlements) {
    for (const place of places) {
      const meters = distanceMeters(place.coordinates, settlement.coordinates);
      if (meters <= NAMED_AFTER_SETTLEMENT_KM * 1000 && (!best || meters < best.meters)) {
        best = { name: settlement.name, meters };
      }
    }
  }
  return best?.name;
}

export type PlaceStop<T extends Place> = {
  label: string;
  /** Where along the route the stop's first and last places are. */
  startKm: number;
  endKm: number;
  /** A point to show on the map. */
  coordinates: LonLat;
  places: (T & { alongKm: number; offRouteKm: number })[];
};

function mostCommon(values: (string | undefined)[]): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: string | undefined;
  for (const [value, count] of counts) if (!best || count > counts.get(best)!) best = value;
  return best;
}

/**
 * Groups places into stops along the route, in order. Each stop is named after a trip stop
 * within 15 km, else the nearest town or village within 6 km, else the town in its places'
 * addresses, else a place's name, else its brand (or `kind`, e.g. "Water tap") and how far
 * along the route it is.
 */
export function stopsAlong<T extends Place>(
  line: RouteLine,
  places: T[],
  kind: (place: T) => string,
  settlements: Settlement[] = []
): PlaceStop<T>[] {
  const placed = places
    .map((place) => ({ ...place, ...locateOnRoute(line, place.coordinates) }))
    .filter((place) => place.offRouteKm <= SEARCH_RADIUS_METERS / 1000 + 0.5)
    .sort((a, b) => a.alongKm - b.alongKm);

  const groups: (typeof placed)[] = [];
  for (const place of placed) {
    const group = groups[groups.length - 1];
    if (group && place.alongKm - group[group.length - 1].alongKm <= STOP_SPREAD_KM) group.push(place);
    else groups.push([place]);
  }

  const tripStops = tripStopsAlong(line);
  const stops: PlaceStop<T>[] = groups.map((group) => {
    const startKm = group[0].alongKm;
    const endKm = group[group.length - 1].alongKm;
    const middle = (startKm + endKm) / 2;
    const nearStop = tripStops
      .filter((stop) => Math.abs(stop.km - middle) <= NAMED_AFTER_TRIP_STOP_KM)
      .sort((a, b) => Math.abs(a.km - middle) - Math.abs(b.km - middle))[0];
    const town = mostCommon(group.map((place) => place.town));
    const first = group[0];
    const label =
      nearStop?.name ??
      nearestSettlement(group, settlements) ??
      town ??
      first.name ??
      // A brand or kind alone ("Engen", "Water tap") could be anywhere, so say where.
      `${first.brand ?? kind(first)} (km ${Math.round(startKm).toLocaleString('en-US')})`;
    return { label, startKm, endKm, coordinates: first.coordinates, places: group };
  });

  // Neighbouring stops with the same name (a town's garages a little over 3 km apart) are one
  // stop; two far apart that happen to share a name (two "Shell Ultra City"s) aren't.
  const merged: PlaceStop<T>[] = [];
  for (const stop of stops) {
    const previous = merged[merged.length - 1];
    if (previous && previous.label === stop.label && stop.startKm - previous.endKm <= MERGE_SAME_NAME_KM) {
      merged[merged.length - 1] = { ...previous, endKm: stop.endKm, places: [...previous.places, ...stop.places] };
    } else {
      merged.push(stop);
    }
  }
  return merged;
}

export type Stretch = {
  from: string;
  to: string;
  startKm: number;
  endKm: number;
  distanceKm: number;
};

/** Stretches shorter than this (e.g. from the start to a garage in the same town) aren't listed. */
const SHORTEST_STRETCH_KM = 2;

/** The route split at each stop, from the trip's start to its end. */
export function stretchesBetween(line: RouteLine, stops: { label: string; startKm: number; endKm: number }[]): Stretch[] {
  const tripStops = tripStopsAlong(line);
  if (tripStops.length === 0) return [];
  const stretches: Stretch[] = [];
  let from = tripStops[0].name;
  let startKm = 0;
  const add = (to: string, endKm: number) => {
    const distanceKm = endKm - startKm;
    // Within one town (e.g. from its garages to the trip stop there) isn't a stretch to plan.
    if (distanceKm < SHORTEST_STRETCH_KM || from === to) return;
    stretches.push({ from, to, startKm, endKm, distanceKm });
  };
  for (const stop of stops) {
    add(stop.label, stop.startKm);
    from = stop.label;
    startKm = stop.endKm;
  }
  add(tripStops[tripStops.length - 1].name, line.totalKm);
  return stretches;
}

// -- Fuel and water from OpenStreetMap ------------------------------------------------

export type FuelStation = Place;

export type WaterKind = 'Drinking water' | 'Water point' | 'Water tap' | 'Well';

export type WaterPoint = Place & {
  kind: WaterKind;
  /** Wells and springs: the water may need boiling or treating before drinking. */
  needsTreating: boolean;
  /** Mapped as not drinkable (e.g. for washing or vehicles). */
  notForDrinking: boolean;
};

export type RouteSupplies = {
  fuel: FuelStation[];
  water: WaterPoint[];
  /** Towns and villages near the route, to name the stops after. */
  settlements: Settlement[];
};

/** What's searched for along the route, in OpenStreetMap tags. */
const SUPPLY_FILTERS = [
  '["amenity"="fuel"]',
  '["amenity"="drinking_water"]',
  '["amenity"="water_point"]',
  '["man_made"="water_tap"]',
  '["man_made"="water_well"]',
];

/** Settlements are searched a little wider than the stops, so a stop 5 km off the route still finds its town. */
const SETTLEMENT_RADIUS_METERS = SEARCH_RADIUS_METERS + NAMED_AFTER_SETTLEMENT_KM * 1000;
const SETTLEMENT_KINDS = ['city', 'town', 'village'];

/**
 * One Overpass query for fuel stations and water points within 5 km of a route, and the
 * towns and villages near it. One query
 * rather than two, because the public servers are busy and limit how often each app asks.
 * The line is simplified first (to about 300 m), which keeps the query small without
 * moving the search area noticeably.
 */
export function overpassSuppliesQuery(route: LonLat[]): string {
  const around = simplifyLine(route, 300)
    .map(([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`)
    .join(',');
  const searches =
    SUPPLY_FILTERS.map((filter) => `nwr${filter}(around:${SEARCH_RADIUS_METERS},${around});`).join('') +
    `node["place"~"^(${SETTLEMENT_KINDS.join('|')})$"]["name"](around:${SETTLEMENT_RADIUS_METERS},${around});`;
  return `[out:json][timeout:90];(${searches});out center tags;`;
}

function waterKind(tags: Record<string, string>): WaterKind | undefined {
  if (tags.amenity === 'drinking_water') return 'Drinking water';
  if (tags.amenity === 'water_point') return 'Water point';
  if (tags.man_made === 'water_tap') return 'Water tap';
  if (tags.man_made === 'water_well') return 'Well';
  return undefined;
}

/**
 * Fuel stations and water points from an Overpass response. Places mapped both as a point
 * and as an area show up twice; those within 100 m of each other with the same name and
 * kind are kept once.
 */
export function parseOverpassSupplies(response: any): RouteSupplies {
  const fuel: FuelStation[] = [];
  const water: WaterPoint[] = [];
  const settlements: Settlement[] = [];
  const isDuplicate = (list: Place[], place: Place, sameKind: (other: any) => boolean) =>
    list.some(
      (other) =>
        sameKind(other) &&
        (other.name ?? other.brand) === (place.name ?? place.brand) &&
        distanceMeters(other.coordinates, place.coordinates) < 100
    );

  for (const element of response?.elements ?? []) {
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    const tags: Record<string, string> = element.tags ?? {};
    const place: Place = {
      id: `${element.type}/${element.id}`,
      coordinates: [lon, lat],
      name: tags.name || undefined,
      brand: tags.brand || undefined,
      town: tags['addr:city'] || tags['addr:place'] || undefined,
    };

    if (tags.place && SETTLEMENT_KINDS.includes(tags.place) && tags.name) {
      settlements.push({ name: tags.name, coordinates: [lon, lat] });
      continue;
    }
    if (tags.amenity === 'fuel') {
      if (!isDuplicate(fuel, place, () => true)) fuel.push(place);
      continue;
    }
    const kind = waterKind(tags);
    if (!kind) continue;
    const source = (tags.water_source ?? '').toLowerCase();
    const point: WaterPoint = {
      ...place,
      kind,
      needsTreating: kind === 'Well' || tags.natural === 'spring' || source === 'well' || source === 'spring',
      notForDrinking: tags.drinking_water === 'no',
    };
    if (!isDuplicate(water, point, (other: WaterPoint) => other.kind === point.kind)) water.push(point);
  }
  return { fuel, water, settlements };
}
