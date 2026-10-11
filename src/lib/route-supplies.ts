import { useEffect, useMemo, useRef, useState } from 'react';

import { simplifyLine, type LonLat } from '@/lib/route-math';
import { overpassSuppliesQuery, parseOverpassSupplies, type RouteSupplies } from '@/lib/route-points';
import { storage } from '@/lib/storage';

/**
 * Public Overpass servers, tried in order. They're often busy, and refuse requests that
 * don't say which app they come from.
 */
const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const USER_AGENT = 'Spoor/1.0 (overland trip planner app; https://github.com/Xtofferson/Spoor)';
const TIMEOUT_MS = 90_000;

export class SuppliesError extends Error {}

/** Fuel stations and water points within 5 km of a route, from OpenStreetMap. */
export async function fetchRouteSupplies(route: LonLat[]): Promise<RouteSupplies> {
  const body = `data=${encodeURIComponent(overpassSuppliesQuery(route))}`;
  for (const server of OVERPASS_SERVERS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(server, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
        body,
        signal: controller.signal,
      });
      // A busy server answers with an HTML error page instead of JSON; try the next one.
      if (!response.ok) continue;
      const json = await response.json().catch(() => undefined);
      if (json?.elements) return parseOverpassSupplies(json);
    } catch {
      // Offline, timed out or refused: try the next server.
    } finally {
      clearTimeout(timer);
    }
  }
  throw new SuppliesError(
    'Couldn’t get fuel and water points from OpenStreetMap: its servers are busy or you’re offline. Try again in a few minutes.'
  );
}

// -- Saved on the phone, so a trip's fuel and water stops show offline -------------

export type SavedSupplies = RouteSupplies & { fetchedAt: number };

/** A short, stable id for a route's shape, so saved stations are reused for the same route. */
function routeKey(route: LonLat[]): string {
  const text = simplifyLine(route, 300)
    .map(([lon, lat]) => `${lon.toFixed(3)},${lat.toFixed(3)}`)
    .join(';');
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  // v3: fuel, water and the towns near the route.
  return `spoor.supplies.v3.${hash.toString(36)}.${text.length}`;
}

function readSaved(key: string): SavedSupplies | undefined {
  const raw = storage.getItem(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as SavedSupplies;
  } catch {
    return undefined;
  }
}

const IDLE = { status: 'idle' } as const;

export type SuppliesState =
  | { status: 'idle' }
  | { status: 'loading'; saved?: SavedSupplies }
  | ({ status: 'ready' } & SavedSupplies)
  | { status: 'error'; message: string; saved?: SavedSupplies };

/**
 * Fuel stations and water points along a route. Ones saved for the same route show straight
 * away, even offline; increase `refreshKey` to look them up again.
 */
export function useRouteSupplies(route: LonLat[] | undefined, refreshKey = 0): SuppliesState {
  const key = useMemo(() => (route && route.length > 1 ? routeKey(route) : ''), [route]);
  const saved = useMemo(() => (key ? readSaved(key) : undefined), [key]);
  const useSaved = saved !== undefined && refreshKey === 0;
  const request = `${key}#${refreshKey}`;
  const [result, setResult] = useState<{ request: string; value: SuppliesState } | null>(null);
  // The latest route, read when fetching. The fetch itself depends only on `key`, so a new
  // array with the same shape doesn't look stations up again.
  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  });

  useEffect(() => {
    const line = routeRef.current;
    if (!key || useSaved || !line) return;
    let cancelled = false;
    fetchRouteSupplies(line)
      .then((supplies) => {
        const value: SavedSupplies = { ...supplies, fetchedAt: Date.now() };
        storage.setItem(key, JSON.stringify(value));
        if (!cancelled) setResult({ request, value: { status: 'ready', ...value } });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof SuppliesError ? error.message : 'Couldn’t get fuel and water points from OpenStreetMap.';
        if (!cancelled) setResult({ request, value: { status: 'error', message } });
      });
    return () => {
      cancelled = true;
    };
  }, [key, useSaved, request]);

  // Built once per saved result, so screens can depend on what this returns.
  const savedReady = useMemo<SuppliesState | undefined>(() => saved && { status: 'ready', ...saved }, [saved]);
  const loading = useMemo<SuppliesState>(() => ({ status: 'loading', saved }), [saved]);
  const failed = useMemo<SuppliesState | undefined>(
    () => (result?.value.status === 'error' ? { ...result.value, saved } : undefined),
    [result, saved]
  );

  if (!key) return IDLE;
  if (result?.request === request) {
    // Keep showing what was saved under an error, e.g. when offline.
    return failed ?? result.value;
  }
  if (useSaved && savedReady) return savedReady;
  return loading;
}
