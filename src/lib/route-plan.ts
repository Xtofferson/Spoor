import { useEffect, useMemo, useState } from 'react';
import { t } from '@/lib/i18n';

import {
  choiceFitsLeg,
  combineShares,
  distanceMeters,
  areaAround,
  distinctiveRoads,
  firstBorderCrossing,
  MAX_ALTERNATIVES_STRAIGHT_LINE_METERS,
  MAX_AVOID_AREAS_STRAIGHT_LINE_METERS,
  pickPlace,
  routeTags,
  simplifyLine,
  surfaceMeters,
  toShares,
  withoutNearlyIdentical,
  type ChosenRoute,
  type ExtraRange,
  type LonLat,
  type PlaceCandidate,
  type RouteTag,
  type SurfaceShares,
} from '@/lib/route-math';
import { storage } from '@/lib/storage';
import type { Trip } from '@/lib/trips';

const ORS_URL = 'https://api.openrouteservice.org';
const ORS_KEY = process.env.EXPO_PUBLIC_ORS_KEY;

/** How far from the previous stop to look for the next one. */
const SEARCH_RADIUS_KM = 2000;

export type PlannedStop = {
  /** The trip stop this is, so a leg's chosen route can be saved on it. */
  stopId: string;
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
  surface: SurfaceShares;
  /** First and last point of this leg in the plan's geometry. */
  points: [number, number];
};

export type RoutePlan = {
  stops: PlannedStop[];
  /** The driving route as `[longitude, latitude]` points. */
  geometry: LonLat[];
  legs: RouteLeg[];
};

export class RouteError extends Error {}

export async function orsFetch(path: string, init?: RequestInit) {
  if (!ORS_KEY) {
    throw new RouteError(t('errors.orsKeyMissing'));
  }
  let response: Response;
  try {
    response = await fetch(`${ORS_URL}${path}`, {
      ...init,
      headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new RouteError(t('errors.orsUnreachable'));
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message: string = body?.error?.message ?? body?.error ?? `Request failed (${response.status})`;
    if (message === 'Quota exceeded' || response.status === 429) {
      throw new RouteError(t('errors.orsQuota'));
    }
    // Checked before the general distance limit below, whose message is similar.
    if (message.includes('alternative Routes algorithm') || message.includes('With avoid areas')) {
      throw new RouteError(t('errors.orsLimit', { message }));
    }
    if (message.includes('route distance must not be greater than')) {
      throw new RouteError(t('errors.orsTooFar'));
    }
    throw new RouteError(t('errors.ors', { message }));
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
  stopId: string;
  name: string;
  coordinates?: LonLat;
  /** The place a pin came from, when it was chosen from search suggestions. */
  label?: string;
};

/** Identifies a route by its stops, so a saved route is reused only for the same stops. */
function routeId(inputs: RouteStopInput[]) {
  // Names keep their capitals: the planner reads them back from here to label the legs.
  return JSON.stringify(
    inputs.map(({ stopId, name, coordinates, label }) => [stopId, name, coordinates ?? null, label ?? null])
  );
}

function planKey(id: string) {
  // v3: plans now keep each leg's surface and position in the geometry.
  return `spoor.route.v3.${id}`;
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

/** Finds a stop, preferring places near the previous stop, then anywhere. */
async function locateStop(stopId: string, name: string, previous?: LonLat): Promise<PlannedStop> {
  const key = placeKey(name, previous);
  const saved = readSaved<Omit<PlannedStop, 'stopId'>>(key);
  if (saved) return { ...saved, stopId };

  let place = previous ? pickPlace(name, await searchPlaces(name, previous), previous) : undefined;
  if (!place) {
    const anywhere = await searchPlaces(name);
    place = pickPlace(name, anywhere) ?? anywhere[0];
  }
  if (!place) throw new RouteError(t('errors.placeNotFound', { name }));

  const stop = { name, label: place.label, coordinates: place.coordinates };
  storage.setItem(key, JSON.stringify(stop));
  return { ...stop, stopId };
}

function directionsRequest(coordinates: LonLat[], extra: object = {}) {
  return orsFetch('/v2/directions/driving-car/geojson', {
    method: 'POST',
    body: JSON.stringify({
      coordinates,
      // Snap each stop to the nearest road however far it is, e.g. a lodge down a long track.
      radiuses: coordinates.map(() => -1),
      extra_info: ['surface', 'waytype'],
      // Needed for per-leg distances and times, and the road names of alternatives.
      instructions: true,
      ...extra,
    }),
  });
}

function extrasOf(properties: any): { surface: ExtraRange[]; waytype: ExtraRange[] } {
  return {
    surface: properties.extras?.surface?.values ?? [],
    waytype: properties.extras?.waytype?.values ?? [],
  };
}

async function planRoute(inputs: RouteStopInput[]): Promise<RoutePlan> {
  const stops: PlannedStop[] = [];
  for (const [index, { stopId, name, coordinates, label }] of inputs.entries()) {
    if (coordinates) {
      // Pinned on the map or chosen from suggestions: use the exact spot, no search needed.
      stops.push({ stopId, name, label: label ?? t('routeOptions.pinned'), coordinates });
    } else {
      // One at a time: each search is centred on the stop before it, or for the first
      // stop, on the next pinned one, so "Nata" isn't matched in Panama.
      const near =
        stops[stops.length - 1]?.coordinates ??
        inputs.slice(index + 1).find((input) => input.coordinates)?.coordinates;
      stops.push(await locateStop(stopId, name, near));
    }
  }

  const body = await directionsRequest(stops.map((stop) => stop.coordinates));
  const feature = body.features?.[0];
  if (!feature) throw new RouteError(t('errors.noRoute'));
  const { properties, geometry } = feature;
  const { surface, waytype } = extrasOf(properties);
  const wayPoints: number[] = properties.way_points ?? [];

  return {
    stops,
    geometry: geometry.coordinates,
    legs: (properties.segments ?? []).map((segment: any, index: number) => {
      const points: [number, number] = [wayPoints[index] ?? 0, wayPoints[index + 1] ?? 0];
      return {
        from: stops[index].name,
        to: stops[index + 1].name,
        distance: segment.distance ?? 0,
        duration: segment.duration ?? 0,
        surface: toShares(surfaceMeters(geometry.coordinates, surface, waytype, points[0], points[1])),
        points,
      };
    }),
  };
}

// -- The route as shown, with any chosen leg routes --------------------------

export type ShownLeg = Omit<RouteLeg, 'points'> & {
  geometry: LonLat[];
  /** The chosen route's name, when a route option was picked for this leg. */
  chosen?: string;
};

export type ShownRoute = {
  stops: PlannedStop[];
  legs: ShownLeg[];
  distance: number;
  duration: number;
  surface: SurfaceShares;
};

/** The trip's route with each leg's chosen route option swapped in, while it still fits the leg. */
export function applyChosenRoutes(plan: RoutePlan, trip: Trip | undefined): ShownRoute {
  const legs: ShownLeg[] = plan.legs.map(({ points, ...leg }, index) => {
    const from = plan.stops[index];
    const to = plan.stops[index + 1];
    const choice = trip?.stops.find((stop) => stop.id === to.stopId)?.route;
    if (choice && choiceFitsLeg(choice, from.coordinates, to.coordinates)) {
      return {
        ...leg,
        distance: choice.distance,
        duration: choice.duration,
        surface: choice.surface,
        geometry: choice.geometry,
        chosen: choice.name,
      };
    }
    return { ...leg, geometry: plan.geometry.slice(points[0], points[1] + 1) };
  });
  return {
    stops: plan.stops,
    legs,
    distance: legs.reduce((sum, leg) => sum + leg.distance, 0),
    duration: legs.reduce((sum, leg) => sum + leg.duration, 0),
    surface: combineShares(legs),
  };
}

// -- Route options for one leg --------------------------------------------------

export type RouteOption = ChosenRoute & { tags: RouteTag[] };

export type RouteOptions = {
  options: RouteOption[];
  /** Why there are fewer options than there might be, e.g. a border crossing that couldn't be avoided. */
  notes: string[];
};

/** Where a route came from, which decides how it's described. */
type Variant = 'alternative' | 'fastest' | 'shortest' | 'other-border';

type FetchedRoute = {
  variant: Variant;
  distance: number;
  duration: number;
  surface: SurfaceShares;
  geometry: LonLat[];
  roads: Record<string, number>;
  countries: ExtraRange[];
};

function toFetchedRoute(feature: any, variant: Variant): FetchedRoute {
  const { surface, waytype } = extrasOf(feature.properties);
  const roads: Record<string, number> = {};
  for (const segment of feature.properties.segments ?? []) {
    for (const step of segment.steps ?? []) {
      if (step.name && step.name !== '-') roads[step.name] = (roads[step.name] ?? 0) + step.distance;
    }
  }
  return {
    variant,
    distance: feature.properties.summary?.distance ?? 0,
    duration: feature.properties.summary?.duration ?? 0,
    surface: toShares(surfaceMeters(feature.geometry.coordinates, surface, waytype)),
    geometry: feature.geometry.coordinates,
    roads,
    countries: feature.properties.extras?.countryinfo?.values ?? [],
  };
}

async function requestVariant(from: LonLat, to: LonLat, variant: Variant, extra: object): Promise<FetchedRoute[]> {
  const body = await directionsRequest([from, to], {
    extra_info: ['surface', 'waytype', 'countryinfo'],
    ...extra,
  });
  const features: any[] = body.features ?? [];
  // Only the built-in alternatives return several routes; every other variant is one route.
  return (variant === 'alternative' ? features : features.slice(0, 1)).map((feature) =>
    toFetchedRoute(feature, variant)
  );
}

/** The most options shown for a leg. */
const MAX_OPTIONS = 3;

/** Runs a variant that's nice to have; if it fails, notes why instead of failing the rest. */
async function optionalVariant(
  run: () => Promise<FetchedRoute[]>,
  notes: string[],
  explain: (message: string) => string
): Promise<FetchedRoute[]> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof RouteError)) throw error;
    notes.push(explain(error.message));
    return [];
  }
}

/**
 * Up to three different routes for one leg. Legs whose ends are within 100 km of each other
 * use OpenRouteService's built-in alternatives, which only work that close. Longer legs ask
 * for the fastest and the shortest route and, if the fastest crosses a border, one that
 * avoids that border crossing. Routes that are practically the same are dropped.
 */
export async function fetchRouteOptions(from: LonLat, to: LonLat): Promise<RouteOptions> {
  const apart = distanceMeters(from, to);
  const notes: string[] = [];
  let routes: FetchedRoute[];

  if (apart <= MAX_ALTERNATIVES_STRAIGHT_LINE_METERS) {
    routes = await requestVariant(from, to, 'alternative', { alternative_routes: { target_count: 3 } });
  } else {
    const [fastest, shortest] = await Promise.all([
      requestVariant(from, to, 'fastest', { preference: 'fastest' }),
      optionalVariant(
        () => requestVariant(from, to, 'shortest', { preference: 'shortest' }),
        notes,
        (message) => t('routeOptions.noShortest', { message })
      ),
    ]);
    routes = [...fastest, ...shortest];

    const crossing = fastest[0] && firstBorderCrossing(fastest[0].geometry, fastest[0].countries);
    if (crossing && apart > MAX_AVOID_AREAS_STRAIGHT_LINE_METERS) {
      notes.push(t('routeOptions.borderTooFar', { km: Math.round(apart / 1000).toLocaleString('en-US') }));
    } else if (crossing) {
      routes.push(
        ...(await optionalVariant(
          () =>
            requestVariant(from, to, 'other-border', {
              preference: 'fastest',
              options: { avoid_polygons: areaAround(crossing) },
            }),
          notes,
          () => t('routeOptions.noOtherBorder')
        ))
      );
    }
  }
  if (routes.length === 0) throw new RouteError(t('errors.noRouteForLeg'));

  const distinct = withoutNearlyIdentical(routes).slice(0, MAX_OPTIONS);
  if (distinct.length === 1 && routes.length > 1) {
    notes.push(t('routeOptions.sameRoad'));
  }
  const roadNames = distinctiveRoads(distinct.map((route) => route.roads));
  return {
    notes,
    options: distinct.map((route, index) => {
      const tags = routeTags(route, distinct);
      if (route.variant === 'other-border') tags.unshift({ text: t('routeOptions.otherBorder'), kind: 'plain' });
      return {
        from,
        to,
        name: roadNames[index] ? t('routeOptions.via', { road: roadNames[index] }) : t('routeOptions.numbered', { number: index + 1 }),
        distance: route.distance,
        duration: route.duration,
        surface: route.surface,
        geometry: simplifyLine(route.geometry),
        tags,
      };
    }),
  };
}

function optionsKey(from: LonLat, to: LonLat) {
  const point = ([lon, lat]: LonLat) => `${lon.toFixed(4)},${lat.toFixed(4)}`;
  // v2: fastest, shortest and border variants for long legs.
  return `spoor.options.v2.${point(from)}>${point(to)}`;
}

export type RouteOptionsState =
  | { status: 'loading' }
  | ({ status: 'ready' } & RouteOptions)
  | { status: 'error'; message: string };

/**
 * Route options for the leg between two points. Options looked at before are reused (the
 * free plan allows only about 200 route requests a day, and a long leg takes up to three);
 * increase `refreshKey` to fetch them again.
 */
export function useRouteOptions(from: LonLat | undefined, to: LonLat | undefined, refreshKey = 0): RouteOptionsState {
  const key = from && to ? optionsKey(from, to) : '';
  const saved = useMemo(() => (key ? readSaved<RouteOptions>(key) : undefined), [key]);
  const useSaved = saved !== undefined && refreshKey === 0;
  const request = `${key}#${refreshKey}`;
  const [result, setResult] = useState<{ request: string; value: RouteOptionsState } | null>(null);

  useEffect(() => {
    if (!key || useSaved) return;
    let cancelled = false;
    // The key holds both ends, so the effect only depends on strings.
    const [a, b] = key
      .slice(key.indexOf('.', 'spoor.options.'.length) + 1)
      .split('>')
      .map((point) => point.split(',').map(Number) as LonLat);
    fetchRouteOptions(a, b)
      .then((options) => {
        storage.setItem(key, JSON.stringify(options));
        if (!cancelled) setResult({ request, value: { status: 'ready', ...options } });
      })
      .catch((error: unknown) => {
        if (!(error instanceof RouteError)) console.warn('Route options failed:', error);
        const message = error instanceof RouteError ? error.message : t('errors.routeOptions');
        if (!cancelled) setResult({ request, value: { status: 'error', message } });
      });
    return () => {
      cancelled = true;
    };
  }, [key, useSaved, request]);

  if (!key) return { status: 'loading' };
  if (result?.request === request) return result.value;
  if (useSaved) return { status: 'ready', ...saved };
  return { status: 'loading' };
}

// -- Hook for the whole trip --------------------------------------------------

export type RoutePlanState =
  | { status: 'idle' }
  | { status: 'loading'; plan?: RoutePlan }
  | { status: 'ready'; plan: RoutePlan }
  | { status: 'error'; message: string; plan?: RoutePlan };

/**
 * Plans the driving route for a trip. A route saved earlier shows straight away, even
 * offline; increase `refreshKey` to fetch it again. Stops with no name and no pin are skipped.
 * Chosen leg routes aren't part of this; apply them with `applyChosenRoutes`.
 */
export function useRoutePlan(trip: Trip | undefined, refreshKey = 0): RoutePlanState {
  const inputs: RouteStopInput[] = (trip?.stops ?? [])
    .map((stop) => ({
      stopId: stop.id,
      name: stop.name.trim(),
      coordinates: stop.coordinates,
      label: stop.placeLabel,
    }))
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
    const stops = (JSON.parse(id) as [string, string, LonLat | null, string | null][]).map(
      ([stopId, name, coordinates, label]) => ({
        stopId,
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
          error instanceof RouteError ? error.message : t('errors.routePlan');
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
