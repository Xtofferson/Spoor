/**
 * Supply points on the phone and in Supabase: the categories, the points near a route
 * (saved for offline use), places added on this phone (uploaded when online, photo and
 * all), and sharing what OpenStreetMap has with everyone.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import {
  categoryFromRow,
  DEFAULT_CATEGORIES,
  rowFromPoint,
  type CategoryRow,
  type SupplyCategory,
  type SupplyPoint,
} from '@/lib/supply-points';
import { t } from '@/lib/i18n';

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
 * sync, so it can be added offline. Returns false if the photo couldn't be kept (e.g. the
 * phone is out of space); the place is still saved, without it.
 */
export function addSupplyPoint(
  point: Omit<SupplyPoint, 'source' | 'pending' | 'createdBy'>,
  photoUri?: string
): { photoSaved: boolean } {
  const userId = currentUserId;
  if (!userId) return { photoSaved: false };
  let localPhotoUri: string | undefined;
  if (photoUri) {
    try {
      const copy = new File(photoDirectory(), `${point.id}.jpg`);
      new File(photoUri).copySync(copy, { overwrite: true });
      localPhotoUri = copy.uri;
    } catch (error) {
      console.warn('Keeping the photo failed:', error);
    }
  }
  storePending(userId, [
    ...pending.get(),
    { ...point, localPhotoUri, source: 'user', createdBy: userId, pending: true },
  ]);
  void syncSupplyPoints(userId);
  return { photoSaved: !photoUri || localPhotoUri !== undefined };
}

/** Changes one unsent place, e.g. once its photo is uploaded, so that step isn't repeated. */
function updatePending(userId: string, id: string, changes: Partial<SupplyPoint>) {
  storePending(
    userId,
    pending.get().map((p) => (p.id === id ? { ...p, ...changes } : p))
  );
}

/** Uploads one place and its photo. Throws if it couldn't be uploaded. */
async function uploadPoint(userId: string, point: SupplyPoint) {
  let photoPath = point.photoPath;
  if (point.localPhotoUri && !photoPath) {
    const file = new File(point.localPhotoUri);
    if (file.exists) {
      const path = `${userId}/${point.id}.jpg`;
      const { error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, await file.arrayBuffer(), { contentType: 'image/jpeg', upsert: false });
      // Already there means an earlier try uploaded it before going offline.
      if (error && !/exists|duplicate/i.test(error.message)) throw error;
      photoPath = path;
      updatePending(userId, point.id, { photoPath });
    } else {
      // The photo is gone from the phone: upload the place without it rather than not at all.
      updatePending(userId, point.id, { localPhotoUri: undefined });
    }
  }
  const { error } = await supabase.from('supply_points').upsert(rowFromPoint({ ...point, photoPath }, userId));
  if (error) throw error;
}

let inFlight: Promise<void> | null = null;

/**
 * Uploads places added on this phone, each with its photo. Quietly waits when offline. Each
 * place is tried on its own, so one that keeps failing doesn't hold up the others.
 */
export function syncSupplyPoints(userId: string): Promise<void> {
  if (inFlight) return inFlight;
  if (userId !== currentUserId || pending.get().length === 0) return Promise.resolve();
  inFlight = uploadPending(userId).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** How many places added on this phone haven't uploaded yet. */
export function pendingPointCount(userId: string): number {
  return userId === currentUserId ? pending.get().length : 0;
}

async function uploadPending(userId: string) {
  let uploaded = false;
  try {
    const network = await Network.getNetworkStateAsync();
    if (network.isConnected === false || network.isInternetReachable === false) return;

    for (const point of pending.get()) {
      if (userId !== currentUserId) return;
      try {
        await uploadPoint(userId, point);
        uploaded = true;
        if (point.localPhotoUri) {
          const file = new File(point.localPhotoUri);
          if (file.exists) file.delete();
        }
        storePending(
          userId,
          pending.get().filter((p) => p.id !== point.id)
        );
      } catch (error) {
        // Kept for the next sync; the others still go.
        console.warn('Supply point upload failed:', error);
        updatePending(userId, point.id, { uploadAttempts: (point.uploadAttempts ?? 0) + 1 });
      }
    }
  } finally {
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
  if (!userId) return t('errors.signInToDelete');
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
  if (error) return t('errors.deleteFailed');
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

// -- What the trip screens need ------------------------------------------------------------

/** Places added on this phone that haven't been uploaded yet. */
export function usePendingPoints(): SupplyPoint[] {
  return useSyncExternalStore(pending.subscribe, pending.get, pending.get);
}

/** Goes up whenever places are added or deleted in Supabase, so routes read them again. */
export function useSuppliesVersion(): number {
  return useSyncExternalStore(version.subscribe, version.get, version.get);
}

/** Remembers points shown on the map (e.g. fresh from OpenStreetMap), for the detail screen. */
export function useRememberPoints(points: SupplyPoint[]) {
  useEffect(() => {
    remember(points);
  }, [points]);
}
