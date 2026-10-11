import * as Network from 'expo-network';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { chooseVehicle, type Vehicle } from '@/lib/fuel';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

/** The vehicle as kept on the phone; `dirty` while a change hasn't reached the account yet. */
type StoredVehicle = Vehicle & { dirty?: boolean };

function storageKey(userId: string) {
  return `spoor.vehicle.v1.${userId}`;
}

let currentUserId: string | null = null;
let current: StoredVehicle | undefined;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function load(userId: string): StoredVehicle | undefined {
  const raw = storage.getItem(storageKey(userId));
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as StoredVehicle;
  } catch {
    return undefined;
  }
}

function store(userId: string, vehicle: StoredVehicle | undefined) {
  if (userId !== currentUserId) return;
  current = vehicle;
  if (vehicle) storage.setItem(storageKey(userId), JSON.stringify(vehicle));
  else storage.removeItem(storageKey(userId));
  emit();
}

/** Switches to the signed-in user's vehicle, or clears it when signed out. */
export function setVehicleUser(userId: string | null) {
  if (userId === currentUserId) return;
  currentUserId = userId;
  current = userId ? load(userId) : undefined;
  emit();
}

/** The signed-in user's vehicle, if they've set one up. */
export function useVehicle(): Vehicle | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => current,
    () => undefined
  );
}

/** Saves the vehicle on the phone straight away; it reaches the account on the next sync. */
export function saveVehicle(vehicle: Omit<Vehicle, 'updatedAt'>) {
  if (!currentUserId) return;
  store(currentUserId, { ...vehicle, updatedAt: Date.now(), dirty: true });
  void syncVehicle(currentUserId);
}

let syncing = false;

/**
 * Keeps the phone's copy and the account's copy (in the user's Supabase profile data) the
 * same: the newer one wins. Does nothing quietly when offline; the phone's copy still works.
 */
export async function syncVehicle(userId: string) {
  if (syncing) return;
  syncing = true;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user || data.user.id !== userId) return;
    const remote = data.user.user_metadata?.vehicle as Vehicle | undefined;
    const local = userId === currentUserId ? current : load(userId);
    const { keep, upload } = chooseVehicle(local, remote);

    if (keep === 'remote' && remote) store(userId, remote);
    if (upload && local) {
      const { dirty: _dirty, ...vehicle } = local;
      const { error: updateError } = await supabase.auth.updateUser({ data: { vehicle } });
      // Mark it synced only if it wasn't edited again meanwhile.
      if (!updateError && current?.updatedAt === local.updatedAt) store(userId, vehicle);
    }
  } catch (error) {
    console.warn('Vehicle sync failed:', error);
  } finally {
    syncing = false;
  }
}

/** Keeps the signed-in user's vehicle in sync while the app is open, like their trips. */
export function useVehicleSync(userId: string) {
  const network = Network.useNetworkState();

  // On sign-in and when the phone gets back online.
  useEffect(() => {
    void syncVehicle(userId);
  }, [userId, network.isInternetReachable]);

  // When the app comes back to the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncVehicle(userId);
    });
    return () => subscription.remove();
  }, [userId]);
}
