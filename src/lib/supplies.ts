/**
 * Supply points on the phone and in Supabase: the categories, the points near a route
 * (saved for offline use), places added on this phone (uploaded when online, photo and
 * all), and sharing what OpenStreetMap has with everyone.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { LonLat } from '@/lib/route-math';
import type { RouteSupplies } from '@/lib/route-points';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import {
  categoryFromRow,
  DEFAULT_CATEGORIES,
  osmSeedRows,
  pointFromOsm,
  pointFromRow,
  routeBounds,
  rowFromPoint,
  type CategoryRow,
  type PointRow,
  type SupplyCategory,
  type SupplyPoint,
} from '@/lib/supply-points';

const PHOTO_BUCKET = 'supply-photos';

function readJson<T>(key: string): T | undefined {
  const raw = storage.getItem(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** A tiny store that React components can subscribe to. */
function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// -- Categories ---------------------------------------------------------------------

const CATEGORIES_KEY = 'spoor.supplyCategories.v1';
const categories = createStore<SupplyCategory[]>(readJson<SupplyCategory[]>(CATEGORIES_KEY) ?? DEFAULT_CATEGORIES);
let categoriesFetched = false;

/** Reads the categories from Supabase, once per app launch; the saved ones are used meanwhile. */
async function refreshCategories() {
  if (categoriesFetched) return;
  categoriesFetched = true;
  const { data, error } = await supabase.from('supply_categories').select('*').order('sort');
  if (error || !data || data.length === 0) {
    categoriesFetched = false;
    return;
  }
  const next = (data as CategoryRow[]).map(categoryFromRow);
  storage.setItem(CATEGORIES_KEY, JSON.stringify(next));
  categories.set(next);
}

/** The supply categories, from Supabase when it has been reached, else as last saved. */
export function useSupplyCategories(): SupplyCategory[] {
  useEffect(() => {
    void refreshCategories();
  }, []);
  return useSyncExternalStore(categories.subscribe, categories.get, categories.get);
}

// -- Places added on this phone -------------------------------------------------------

let currentUserId: string | null = null;
const NO_POINTS: SupplyPoint[] = [];
const pending = createStore<SupplyPoint[]>(NO_POINTS);
/** Goes up whenever points change in Supabase, so screens fetch them again. */
const version = createStore(0);

function pendingKey(userId: string) {
  return `spoor.pendingSupplyPoints.v1.${userId}`;
}

function storePending(userId: string, points: SupplyPoint[]) {
  if (userId !== currentUserId) return;
  storage.setItem(pendingKey(userId), JSON.stringify(points));
  pending.set(points);
}

/** Switches to the signed-in user's unsent places, or clears them when signed out. */
export function setSuppliesUser(userId: string | null) {
  if (userId === currentUserId) return;
  currentUserId = userId;
  pending.set(userId ? (readJson<SupplyPoint[]>(pendingKey(userId)) ?? NO_POINTS) : NO_POINTS);
}

export function currentSuppliesUser() {
  return currentUserId;
}

/** Photos waiting to upload are kept here, as the picker's copies can be cleared. */
function photoDirectory() {
  const directory = new Directory(Paths.document, 'supply-photos');
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

/**
 * Saves a new place on the phone straight away; it's uploaded with its photo on the next
 * sync, so it can be added offline.
 */
export function addSupplyPoint(point: Omit<SupplyPoint, 'source' | 'pending' | 'createdBy'>, photoUri?: string) {
  const userId = currentUserId;
  if (!userId) return;
  let localPhotoUri: string | undefined;
  if (photoUri) {
    const copy = new File(photoDirectory(), `${point.id}.jpg`);
    new File(photoUri).copySync(copy, { overwrite: true });
    localPhotoUri = copy.uri;
  }
  storePending(userId, [
    ...pending.get(),
    { ...point, localPhotoUri, source: 'user', createdBy: userId, pending: true },
  ]);
  void syncSupplyPoints(userId);
}

let syncing = false;

/** Uploads places added on this phone, each with its photo. Quietly waits when offline. */
export async function syncSupplyPoints(userId: string) {
  if (syncing || userId !== currentUserId) return;
  syncing = true;
  let uploaded = false;
  try {
    for (const point of pending.get()) {
      let photoPath = point.photoPath;
      if (point.localPhotoUri && !photoPath) {
        const path = `${userId}/${point.id}.jpg`;
        const bytes = await new File(point.localPhotoUri).arrayBuffer();
        const { error } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
        // Already there means an earlier try uploaded it before going offline.
        if (error && !/exists|duplicate/i.test(error.message)) throw error;
        photoPath = path;
      }
      const { error } = await supabase
        .from('supply_points')
        .upsert(rowFromPoint({ ...point, photoPath }, userId));
      if (error) throw error;
      uploaded = true;

      if (point.localPhotoUri) {
        const file = new File(point.localPhotoUri);
        if (file.exists) file.delete();
      }
      storePending(
        userId,
        pending.get().filter((p) => p.id !== point.id)
      );
    }
  } catch (error) {
    // Offline or the server is unreachable: try again later.
    console.warn('Supply point upload failed:', error);
  } finally {
    syncing = false;
    if (uploaded) version.set(version.get() + 1);
  }
}

/** Keeps places added on this phone uploading while the app is open, like trips. */
export function useSupplySync(userId: string) {
  const network = Network.useNetworkState();

  useEffect(() => {
    void syncSupplyPoints(userId);
  }, [userId, network.isInternetReachable]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncSupplyPoints(userId);
    });
    return () => subscription.remove();
  }, [userId]);
}

/** Deletes a place you added: straight away if it hasn't been uploaded, else in Supabase. */
export async function deleteSupplyPoint(point: SupplyPoint): Promise<string | undefined> {
  const userId = currentUserId;
  if (!userId) return 'Sign in to delete places.';
  if (point.pending) {
    if (point.localPhotoUri) {
      const file = new File(point.localPhotoUri);
      if (file.exists) file.delete();
    }
    storePending(
      userId,
      pending.get().filter((p) => p.id !== point.id)
    );
    return undefined;
  }
  const { error } = await supabase.from('supply_points').delete().eq('id', point.id);
  if (error) return 'Couldn’t delete it. Check your connection and try again.';
  if (point.photoPath) await supabase.storage.from(PHOTO_BUCKET).remove([point.photoPath]);
  forget(point.id);
  version.set(version.get() + 1);
  return undefined;
}

/** A photo's address, for showing it. Photos are public, so the address works offline from the image cache. */
export function photoUrl(point: SupplyPoint): string | undefined {
  if (point.localPhotoUri) return point.localPhotoUri;
  if (!point.photoPath) return undefined;
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(point.photoPath).data.publicUrl;
}

// -- Points shown, for the detail screen -------------------------------------------------

/** Every point shown on a map this session, so the detail screen can find one by id. */
const shown = new Map<string, SupplyPoint>();

function remember(points: SupplyPoint[]) {
  for (const point of points) shown.set(point.id, point);
}

function forget(id: string) {
  shown.delete(id);
}

export function findSupplyPoint(id: string): SupplyPoint | undefined {
  return pending.get().find((point) => point.id === id) ?? shown.get(id);
}

// -- Points near a route -----------------------------------------------------------------

export type SupplyPointsState = {
  /** Points from Supabase near the route, as last fetched (saved for offline use). */
  shared: SupplyPoint[];
  /** Places added on this phone that haven't been uploaded yet. */
  pending: SupplyPoint[];
  status: 'idle' | 'loading' | 'ready' | 'offline';
  fetchedAt?: number;
};

type SavedPoints = { points: SupplyPoint[]; fetchedAt: number };

/** Points are fetched in a box around the route this much wider than the 10 km search. */
const BOUNDS_MARGIN_KM = 12;

function pointsKey(routeId: string) {
  return `spoor.supplyPoints.v1.${routeId}`;
}

/**
 * Supply points near a route: shared ones from Supabase (fetched each time the route is
 * shown, and saved for offline use) and ones added on this phone.
 * `routeId` identifies the route for saving; `route` is its line.
 */
export function useSupplyPoints(routeId: string, route: LonLat[] | undefined): SupplyPointsState {
  const changes = useSyncExternalStore(version.subscribe, version.get, version.get);
  const unsent = useSyncExternalStore(pending.subscribe, pending.get, pending.get);
  const saved = useMemo(() => (routeId ? readJson<SavedPoints>(pointsKey(routeId)) : undefined), [routeId]);
  const [result, setResult] = useState<{ request: string; saved?: SavedPoints; failed?: boolean } | null>(null);
  const request = `${routeId}#${changes}`;
  // The bounds as a string, so effects depend on them by value.
  const bounds = useMemo(() => (route && route.length > 1 ? JSON.stringify(routeBounds(route, BOUNDS_MARGIN_KM)) : ''), [route]);

  useEffect(() => {
    if (!routeId || !bounds) return;
    let cancelled = false;
    const { minLat, maxLat, minLon, maxLon } = JSON.parse(bounds) as ReturnType<typeof routeBounds>;
    supabase
      .from('supply_points')
      .select('*')
      .gte('latitude', minLat)
      .lte('latitude', maxLat)
      .gte('longitude', minLon)
      .lte('longitude', maxLon)
      .limit(5000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setResult({ request, failed: true });
          return;
        }
        const value: SavedPoints = { points: (data as PointRow[]).map(pointFromRow), fetchedAt: Date.now() };
        storage.setItem(pointsKey(routeId), JSON.stringify(value));
        setResult({ request, saved: value });
      });
    return () => {
      cancelled = true;
    };
  }, [routeId, bounds, request]);

  const fresh = result?.request === request ? result : undefined;
  const latest = fresh?.saved ?? saved;
  const state = useMemo<SupplyPointsState>(
    () => ({
      shared: latest?.points ?? NO_POINTS,
      pending: unsent,
      status: !routeId ? 'idle' : fresh?.saved ? 'ready' : fresh?.failed ? 'offline' : 'loading',
      fetchedAt: latest?.fetchedAt,
    }),
    [latest, unsent, routeId, fresh]
  );
  useEffect(() => {
    remember(state.shared);
  }, [state.shared]);
  return state;
}

/** Remembers points shown on the map (e.g. fresh from OpenStreetMap), for the detail screen. */
export function useRememberPoints(points: SupplyPoint[]) {
  useEffect(() => {
    remember(points);
  }, [points]);
}

// -- Sharing OpenStreetMap places ---------------------------------------------------------

/**
 * Shares places found on OpenStreetMap along a route with everyone, through Supabase's
 * seed_osm_supply_points function. Best effort: if it fails, the phone still has them.
 */
export async function seedFromOsm(supplies: RouteSupplies, categoryList: SupplyCategory[]) {
  const points = (supplies.supplies ?? []).map((place) => pointFromOsm(place, categoryList));
  if (points.length === 0) return;
  const rows = osmSeedRows(points);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.rpc('seed_osm_supply_points', { points: rows.slice(i, i + 500) });
    if (error) {
      console.warn('Sharing OpenStreetMap supplies failed:', error.message);
      return;
    }
  }
  version.set(version.get() + 1);
}
