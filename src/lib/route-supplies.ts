import { useEffect, useMemo, useRef, useState } from 'react';

import { accessToken } from '@/lib/api-auth';
import { t } from '@/lib/i18n';
import { shareRequest } from '@/lib/in-flight';
import { simplifyLine, type LonLat } from '@/lib/route-math';
import type { Settlement } from '@/lib/route-points';
import { markUsed } from '@/lib/saved-data';
import { storage } from '@/lib/storage';
import { pointFromRow, settlementFromRow, type PointRow, type SettlementRow, type SupplyPoint } from '@/lib/supply-points';

import { tilesAlong } from '../../supabase/functions/supplies/osm';

/**
 * Fuel, water, butcheries, firewood and town names along a route, from Supabase. The
 * "supplies" Edge Function keeps them up to date from OpenStreetMap, one 0.25° tile at a
 * time, shared by everyone; phones never call OpenStreetMap themselves.
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
/** The Edge Function takes at most this many tiles per call. */
const TILES_PER_CALL = 20;
/** Tiles read from Supabase per request, to keep addresses short. */
const TILES_PER_READ = 100;
/** Supabase sends at most this many rows per request. */
const PAGE_SIZE = 1000;
/** A saved result older than this is looked up again (in the background) when the trip opens. */
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

/** Tiles the server has confirmed are up to date since the app started, so they aren't sent again. */
const readyTiles = new Set<string>();

export class SuppliesError extends Error {}

export type RouteSupplies = {
  /** Every place near the route: fuel, water, supplies and checkpoints, from OpenStreetMap and travellers. */
  points: SupplyPoint[];
  /** Towns and villages near the route, to name the stops after. */
  settlements: Settlement[];
  /** Some tiles couldn't be brought up to date (OpenStreetMap was busy), so places may be missing. */
  incomplete?: boolean;
};

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Asks the Edge Function to bring some tiles up to date. False when OpenStreetMap was busy. */
async function prepareTiles(tiles: string[], token: string): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/supplies`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tiles }),
    });
  } catch {
    return false;
  }
  if (response.ok) {
    tiles.forEach((tile) => readyTiles.add(tile));
    return true;
  }
  const body = await response.json().catch(() => null);
  if (body?.error?.code === 'spoor-daily-limit') throw new SuppliesError(t('errors.suppliesUserLimit'));
  if (response.status === 401) throw new SuppliesError(t('errors.signInForSupplies'));
  return false;
}

/** Every row of a table in some tiles, page by page. */
async function readTiles<T>(table: string, tiles: string[], token: string): Promise<T[]> {
  const rows: T[] = [];
  for (const group of chunks(tiles, TILES_PER_READ)) {
    const list = encodeURIComponent(group.map((tile) => `"${tile}"`).join(','));
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?select=*&tile=in.(${list})&order=osm_id&limit=${PAGE_SIZE}&offset=${offset}`,
        { headers: { apikey: SUPABASE_KEY ?? '', Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error(`Reading ${table} failed (${response.status})`);
      const page = (await response.json()) as T[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
  }
  return rows;
}

/**
 * Brings the tiles along a route up to date (through the Edge Function, which only fetches
 * OpenStreetMap for tiles not looked up in the last 30 days), then reads what's in them.
 * `onProgress` hears how many groups of tiles are done.
 */
export async function fetchRouteSupplies(
  route: LonLat[],
  onProgress?: (done: number, total: number) => void
): Promise<RouteSupplies> {
  const token = await accessToken();
  if (!token || !SUPABASE_URL) throw new SuppliesError(t('errors.signInForSupplies'));

  const tiles = tilesAlong(simplifyLine(route, 300));
  const batches = chunks(
    tiles.filter((tile) => !readyTiles.has(tile)),
    TILES_PER_CALL
  );
  let incomplete = false;
  for (const [index, batch] of batches.entries()) {
    onProgress?.(index, batches.length);
    if (!(await prepareTiles(batch, token))) incomplete = true;
  }
  onProgress?.(batches.length, batches.length);

  try {
    const [points, settlements] = await Promise.all([
      readTiles<PointRow>('supply_points', tiles, token),
      readTiles<SettlementRow>('settlements', tiles, token),
    ]);
    return { points: points.map(pointFromRow), settlements: settlements.map(settlementFromRow), incomplete };
  } catch {
    throw new SuppliesError(incomplete ? t('errors.suppliesBusy') : t('errors.suppliesOffline'));
  }
}

// -- Saved on the phone, so a trip's fuel and water stops show offline -------------

export type SavedSupplies = RouteSupplies & { fetchedAt: number };

/** A short, stable id for a route's shape, e.g. for saving what was found along it. */
export function routeShapeId(route: LonLat[]): string {
  const text = simplifyLine(route, 300)
    .map(([lon, lat]) => `${lon.toFixed(3)},${lat.toFixed(3)}`)
    .join(';');
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${hash.toString(36)}.${text.length}`;
}

function routeKey(route: LonLat[]): string {
  // v5: everything from Supabase, by tile.
  return `spoor.supplies.v5.${routeShapeId(route)}`;
}

function readSaved(key: string): SavedSupplies | undefined {
  const raw = storage.getItem(key);
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as SavedSupplies;
    markUsed(key);
    return value;
  } catch {
    return undefined;
  }
}

const IDLE = { status: 'idle' } as const;

export type SuppliesState =
  | { status: 'idle' }
  | { status: 'loading'; saved?: SavedSupplies; progress?: { done: number; total: number } }
  | ({ status: 'ready' } & SavedSupplies)
  | { status: 'error'; message: string; saved?: SavedSupplies };

/**
 * Fuel, water and supplies along a route. What was saved for the same route shows straight
 * away, even offline, and is looked up again in the background once it's a day old.
 * Increase `refreshKey` to look them up now; `version` goes up when places are added or
 * deleted, so they're read again.
 */
export function useRouteSupplies(route: LonLat[] | undefined, refreshKey = 0, version = 0): SuppliesState {
  const key = useMemo(() => (route && route.length > 1 ? routeKey(route) : ''), [route]);
  const saved = useMemo(() => (key ? readSaved(key) : undefined), [key]);
  const request = `${key}#${refreshKey}#${version}`;
  const [result, setResult] = useState<{ request: string; value: SuppliesState } | null>(null);
  // The latest route, read when fetching. The fetch itself depends only on `key`, so a new
  // array with the same shape doesn't look supplies up again.
  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  });

  useEffect(() => {
    const line = routeRef.current;
    if (!key || !line) return;
    const fresh = saved && !saved.incomplete && Date.now() - saved.fetchedAt < REFRESH_AFTER_MS;
    if (fresh && refreshKey === 0 && version === 0) return;
    let cancelled = false;
    shareRequest(request, () =>
      fetchRouteSupplies(line, (done, total) => {
        if (!cancelled && total > 0) {
          setResult({ request, value: { status: 'loading', saved, progress: { done, total } } });
        }
      }).then((supplies) => {
        // An incomplete result is kept, but looked up again next time the trip opens.
        const value: SavedSupplies = { ...supplies, fetchedAt: Date.now() };
        storage.setItem(key, JSON.stringify(value));
        markUsed(key);
        return value;
      })
    )
      .then((value) => {
        if (!cancelled) setResult({ request, value: { status: 'ready', ...value } });
      })
      .catch((error: unknown) => {
        const message = error instanceof SuppliesError ? error.message : t('errors.supplies');
        if (!cancelled) setResult({ request, value: { status: 'error', message } });
      });
    return () => {
      cancelled = true;
    };
  }, [key, saved, refreshKey, version, request]);

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
  // While a lookup runs in the background, what was saved shows.
  if (savedReady && refreshKey === 0) return savedReady;
  return loading;
}
