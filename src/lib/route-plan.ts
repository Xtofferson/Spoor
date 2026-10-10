import { useEffect, useMemo, useState } from 'react';

import {
  pickPlace,
  surfaceShares,
  type ExtraRange,
  type LonLat,
  type PlaceCandidate,
  type SurfaceShares,
} from '@/lib/route-math';
import { storage } from '@/lib/storage';
import type { Trip } from '@/lib/trips';

const ORS_URL = 'https://api.openrouteservice.org';
const ORS_KEY = process.env.EXPO_PUBLIC_ORS_KEY;

/** How far from the previous stop to look for the next one. */
const SEARCH_RADIUS_KM = 2000;

export type PlannedStop = {
  name: string;
  /** The place OpenRouteService matched, e.g. "Nata, CT, Botswana". */
  label: string;
  coordinates: LonLat;
};

export type RouteLeg = {
  from: string;
  to: string;
  distance: number;
  duration: number;
};

export type RoutePlan = {
  stops: PlannedStop[];
  /** The driving route as `[longitude, latitude]` points. */
  geometry: LonLat[];
  /** Metres. */
  distance: number;
  /** Seconds. */
  duration: number;
  legs: RouteLeg[];
  surface: SurfaceShares;
};

export class RouteError extends Error {}

export async function orsFetch(path: string, init?: RequestInit) {
  if (!ORS_KEY) {
    throw new RouteError('Missing EXPO_PUBLIC_ORS_KEY. Add it to .env and restart Expo.');
  }
  let response: Response;
  try {
    response = await fetch(`${ORS_URL}${path}`, {
      ...init,
      headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new RouteError('Couldn’t reach OpenRouteService. Check your connection and try again.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message: string = body?.error?.message ?? body?.error ?? `Request failed (${response.status})`;
    if (message === 'Quota exceeded' || response.status === 429) {
      throw new RouteError(
        'OpenRouteService’s free daily limit has been reached. It resets within 24 hours; ' +
          'routes you’ve already viewed and pinned stops still work.'
      );
    }
    if (message.includes('route distance must not be greater than')) {
      throw new RouteError(
        'OpenRouteService can’t plan routes over 6,000 km. If your trip is shorter, a stop was ' +
          'probably found in the wrong country: add the country to its name, e.g. “Nata, ' +
          'Botswana”, or pin it on the map.'
      );
    }
    throw new RouteError(`OpenRouteService: ${message}`);
  }
  return body;
}

// -- Saved results, so routes already looked at still show offline -----------

function readSaved<T>(key: string): T | undefined {
  const raw = storage.getItem(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function placeKey(name: string, previous?: LonLat) {
  // The same name can mean a different place depending on where the route is coming from.
  const near = previous ? `${previous[0].toFixed(1)},${previous[1].toFixed(1)}` : 'start';
  return `spoor.place.v1.${name.trim().toLowerCase()}@${near}`;
}

/** A stop as the planner needs it: its name, and its exact location if pinned on the map. */
export type RouteStopInput = {
  name: string;
  coordinates?: LonLat;
  /** The place a pin came from, when it was chosen from search suggestions. */
  label?: string;
};

/** Identifies a route by its stops, so a saved route is reused only for the same stops. */
function routeId(inputs: RouteStopInput[]) {
  // Names keep their capitals: the planner reads them back from here to label the legs.
  return JSON.stringify(inputs.map(({ name, coordinates, label }) => [name, coordinates ?? null, label ?? null]));
}

function planKey(id: string) {
  return `spoor.route.v2.${id}`;
}

// -- OpenRouteService calls -----------------------------------------------------

async function searchPlaces(name: string, previous?: LonLat): Promise<PlaceCandidate[]> {
  const params = new URLSearchParams({ text: name, size: '20', layers: 'venue,coarse' });
  if (previous) {
    params.set('boundary.circle.lon', String(previous[0]));
    params.set('boundary.circle.lat', String(previous[1]));
    params.set('boundary.circle.radius', String(SEARCH_RADIUS_KM));
  }
  const body = await orsFetch(`/geocode/search?${params}`);
  return (body.features ?? []).map((feature: any) => ({
    coordinates: feature.geometry.coordinates,
    name: feature.properties.name ?? '',
    label: feature.properties.label ?? feature.properties.name ?? name,
    layer: feature.properties.layer ?? '',
  }));
}

/** Finds a stop, preferring places near the previous stop, then anywhere. */
/** Looks up a readable name for a spot picked on the map, e.g. "Kubu Island". */
export async function describeLocation(coordinates: LonLat): Promise<string | undefined> {
  const params = new URLSearchParams({
    'point.lon': String(coordinates[0]),
    'point.lat': String(coordinates[1]),
    size: '1',
    layers: 'venue,coarse',
  });
  const body = await orsFetch(`/geocode/reverse?${params}`);
  const properties = body.features?.[0]?.properties;
  return properties?.name ?? properties?.label;
}

async function locateStop(name: string, previous?: LonLat): Promise<PlannedStop> {
  const key = placeKey(name, previous);
  const saved = readSaved<PlannedStop>(key);
  if (saved) return saved;

  let place = previous ? pickPlace(name, await searchPlaces(name, previous), previous) : undefined;
  if (!place) {
    const anywhere = await searchPlaces(name);
    place = pickPlace(name, anywhere) ?? anywhere[0];
  }
  if (!place) throw new RouteError(`Couldn’t find “${name}”. Try a fuller name, e.g. a town or lodge.`);

  const stop = { name, label: place.label, coordinates: place.coordinates };
  storage.setItem(key, JSON.stringify(stop));
  return stop;
}

async function fetchDirections(stops: PlannedStop[]) {
  return orsFetch('/v2/directions/driving-car/geojson', {
    method: 'POST',
    body: JSON.stringify({
      coordinates: stops.map((stop) => stop.coordinates),
      // Snap each stop to the nearest road however far it is, e.g. a lodge down a long track.
      radiuses: stops.map(() => -1),
      extra_info: ['surface', 'waytype'],
      // Needed for per-leg distances and times.
      instructions: true,
    }),
  });
}

async function planRoute(inputs: RouteStopInput[]): Promise<RoutePlan> {
  const names = inputs.map((input) => input.name);
  const stops: PlannedStop[] = [];
  for (const [index, { name, coordinates, label }] of inputs.entries()) {
    if (coordinates) {
      // Pinned on the map or chosen from suggestions: use the exact spot, no search needed.
      stops.push({ name, label: label ?? 'Pinned on the map', coordinates });
    } else {
      // One at a time: each search is centred on the stop before it, or for the first
      // stop, on the next pinned one, so "Nata" isn't matched in Panama.
      const near =
        stops[stops.length - 1]?.coordinates ??
        inputs.slice(index + 1).find((input) => input.coordinates)?.coordinates;
      stops.push(await locateStop(name, near));
    }
  }

  const body = await fetchDirections(stops);
  const feature = body.features?.[0];
  if (!feature) throw new RouteError('OpenRouteService didn’t return a route.');
  const { properties, geometry } = feature;
  const extras = properties.extras ?? {};

  return {
    stops,
    geometry: geometry.coordinates,
    distance: properties.summary.distance ?? 0,
    duration: properties.summary.duration ?? 0,
    legs: (properties.segments ?? []).map((segment: any, index: number) => ({
      from: names[index],
      to: names[index + 1],
      distance: segment.distance ?? 0,
      duration: segment.duration ?? 0,
    })),
    surface: surfaceShares(
      geometry.coordinates,
      (extras.surface?.values ?? []) as ExtraRange[],
      (extras.waytype?.values ?? []) as ExtraRange[]
    ),
  };
}

// -- Hook ---------------------------------------------------------------------

export type RoutePlanState =
  | { status: 'idle' }
  | { status: 'loading'; plan?: RoutePlan }
  | { status: 'ready'; plan: RoutePlan }
  | { status: 'error'; message: string; plan?: RoutePlan };

/**
 * Plans the driving route for a trip. A route saved earlier shows straight away, even
 * offline; increase `refreshKey` to fetch it again. Stops with no name and no pin are skipped.
 */
export function useRoutePlan(trip: Trip | undefined, refreshKey = 0): RoutePlanState {
  const inputs: RouteStopInput[] = (trip?.stops ?? [])
    .map((stop) => ({ name: stop.name.trim(), coordinates: stop.coordinates, label: stop.placeLabel }))
    .filter((stop) => stop.name !== '' || stop.coordinates);
  // A string, so effects can depend on the stops by value.
  const id = routeId(inputs);
  const hasRoute = inputs.length >= 2;
  const request = `${id}#${refreshKey}`;
  const saved = useMemo(() => readSaved<RoutePlan>(planKey(id)), [id]);
  const useSaved = saved !== undefined && refreshKey === 0;
  const [result, setResult] = useState<{ request: string; value: RoutePlanState } | null>(null);

  useEffect(() => {
    if (!hasRoute || useSaved) return;
    let cancelled = false;
    const stops = (JSON.parse(id) as [string, LonLat | null, string | null][]).map(
      ([name, coordinates, label]) => ({
        name,
        coordinates: coordinates ?? undefined,
        label: label ?? undefined,
      })
    );
    planRoute(stops)
      .then((plan) => {
        storage.setItem(planKey(id), JSON.stringify(plan));
        if (!cancelled) setResult({ request, value: { status: 'ready', plan } });
      })
      .catch((error: unknown) => {
        if (!(error instanceof RouteError)) console.warn('Route planning failed:', error);
        const message =
          error instanceof RouteError ? error.message : 'Something went wrong planning this route.';
        if (!cancelled) setResult({ request, value: { status: 'error', message } });
      });
    return () => {
      cancelled = true;
    };
  }, [hasRoute, useSaved, id, request]);

  if (!hasRoute) return { status: 'idle' };
  if (result?.request === request) {
    // Keep showing the saved route under an error, e.g. when offline.
    return result.value.status === 'error' ? { ...result.value, plan: saved } : result.value;
  }
  if (useSaved) return { status: 'ready', plan: saved };
  return { status: 'loading', plan: saved };
}
