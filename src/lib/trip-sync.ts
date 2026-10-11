import * as Network from 'expo-network';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { FuelStopChoice } from '@/lib/fuel';
import { supabase } from '@/lib/supabase';
import { markTripsSynced, mergeRemoteTrips } from '@/lib/trip-merge';
import { getTripsFor, updateTripsFor, useTrips, type Stop, type Trip } from '@/lib/trips';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

type TripRow = {
  id: string;
  user_id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  people: number | null;
  fuel_stops: FuelStopChoice[] | null;
  stops: Stop[];
  created_at: string;
  updated_at: string;
};

function fromRow(row: TripRow): Trip {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    people: row.people ?? undefined,
    fuelStops: row.fuel_stops ?? undefined,
    stops: row.stops,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

function toRow(trip: Trip, userId: string): TripRow {
  return {
    id: trip.id,
    user_id: userId,
    name: trip.name,
    start_date: trip.startDate,
    end_date: trip.endDate ?? null,
    people: trip.people ?? null,
    fuel_stops: trip.fuelStops ?? null,
    stops: trip.stops,
    created_at: new Date(trip.createdAt).toISOString(),
    updated_at: new Date(trip.updatedAt).toISOString(),
  };
}

let status: SyncStatus = 'idle';
const statusListeners = new Set<() => void>();

function setStatus(next: SyncStatus) {
  status = next;
  statusListeners.forEach((listener) => listener());
}

function subscribeStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    subscribeStatus,
    () => status,
    () => 'idle'
  );
}

let running = false;
let runAgain = false;

/**
 * Downloads the user's trips, merges them into the phone's copy (newest edit wins),
 * then uploads any trips changed on the phone. Safe to call often: overlapping calls
 * are folded into one extra pass.
 */
export async function syncTrips(userId: string) {
  if (running) {
    runAgain = true;
    return;
  }
  running = true;

  try {
    const network = await Network.getNetworkStateAsync();
    if (network.isConnected === false || network.isInternetReachable === false) {
      setStatus('offline');
      return;
    }

    setStatus('syncing');
    do {
      runAgain = false;

      const { data, error } = await supabase.from('trips').select('*');
      if (error) throw error;
      // Merge into the latest local list, which may have changed while downloading.
      updateTripsFor(userId, (trips) => mergeRemoteTrips(trips, (data as TripRow[]).map(fromRow)));

      const pending = getTripsFor(userId).filter((trip) => trip.dirty);
      const deleted = pending.filter((trip) => trip.deletedAt);
      const changed = pending.filter((trip) => !trip.deletedAt);
      if (deleted.length > 0) {
        const { error: deleteError } = await supabase
          .from('trips')
          .delete()
          .in(
            'id',
            deleted.map((trip) => trip.id)
          );
        if (deleteError) throw deleteError;
      }
      if (changed.length > 0) {
        const { error: uploadError } = await supabase
          .from('trips')
          .upsert(changed.map((trip) => toRow(trip, userId)));
        if (uploadError) throw uploadError;
      }
      if (pending.length > 0) {
        updateTripsFor(userId, (trips) => markTripsSynced(trips, pending));
      }
    } while (runAgain);

    setStatus('synced');
  } catch (error) {
    console.warn('Trip sync failed:', error);
    setStatus('error');
  } finally {
    running = false;
  }
}

/** Keeps the signed-in user's trips in sync while the app is open. */
export function useTripSync(userId: string) {
  const trips = useTrips();
  const network = Network.useNetworkState();
  // Changes whenever a trip is saved on the phone and not yet uploaded.
  const pendingKey = trips
    .filter((trip) => trip.dirty)
    .map((trip) => `${trip.id}:${trip.updatedAt}`)
    .join(',');

  // On sign-in, after local edits, and when the phone gets back online.
  useEffect(() => {
    void syncTrips(userId);
  }, [userId, pendingKey, network.isInternetReachable]);

  // When the app comes back to the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncTrips(userId);
    });
    return () => subscription.remove();
  }, [userId]);
}
