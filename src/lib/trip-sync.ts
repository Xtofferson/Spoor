import * as Network from 'expo-network';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { FuelStopChoice } from '@/lib/fuel';
import { t } from '@/lib/i18n';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { markDeletionsSynced, markTripsSaved, mergeRemoteTrips, type SaveResult } from '@/lib/trip-merge';
import { createId, getTripsFor, updateTripsFor, useTrips, type Stop, type Trip } from '@/lib/trips';

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
    serverUpdatedAt: row.updated_at,
  };
}

/** A trip as save_trips takes it; Supabase sets the owner and updated_at itself. */
function toSaved(trip: Trip) {
  return {
    trip: {
      id: trip.id,
      name: trip.name,
      start_date: trip.startDate,
      end_date: trip.endDate ?? null,
      people: trip.people ?? null,
      fuel_stops: trip.fuelStops ?? null,
      stops: trip.stops,
      created_at: new Date(trip.createdAt).toISOString(),
    },
    // The server version this edit is based on; none for a trip never uploaded.
    base: trip.serverUpdatedAt ?? null,
  };
}

// -- Downloading only what changed --------------------------------------------------

/**
 * The newest server time this phone has downloaded, per user. The next sync asks for
 * changes from a minute before it, so a change saved just as the last sync ran isn't missed.
 */
function syncedUpToKey(userId: string) {
  return `spoor.tripsSyncedUpTo.v1.${userId}`;
}

const OVERLAP_MS = 60_000;

function newest(times: string[], previous: string | null): string | null {
  return times.reduce<string | null>((latest, time) => (!latest || Date.parse(time) > Date.parse(latest) ? time : latest), previous);
}

async function downloadChanges(userId: string) {
  const syncedUpTo = storage.getItem(syncedUpToKey(userId));
  const since = syncedUpTo ? new Date(Date.parse(syncedUpTo) - OVERLAP_MS).toISOString() : null;
  const tripsQuery = supabase.from('trips').select('*');
  const deletedQuery = supabase.from('deleted_trips').select('id, deleted_at');
  const [trips, deleted] = await Promise.all([
    since ? tripsQuery.gte('updated_at', since) : tripsQuery,
    since ? deletedQuery.gte('deleted_at', since) : deletedQuery,
  ]);
  if (trips.error) throw trips.error;
  if (deleted.error) throw deleted.error;
  const rows = trips.data as TripRow[];
  const deletions = deleted.data as { id: string; deleted_at: string }[];
  return {
    changes: { trips: rows.map(fromRow), deletedIds: deletions.map((row) => row.id), full: !since },
    upTo: newest([...rows.map((row) => row.updated_at), ...deletions.map((row) => row.deleted_at)], syncedUpTo),
  };
}

/** Clears what this phone has synced, e.g. so the next sync downloads everything again. */
export function forgetSyncProgress(userId: string) {
  storage.removeItem(syncedUpToKey(userId));
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

let inFlight: Promise<void> | null = null;
let runAgain = false;

/**
 * Downloads the user's trips, merges them into the phone's copy (newest edit wins),
 * then uploads any trips changed on the phone. Safe to call often: overlapping calls
 * are folded into one extra pass, and wait for it.
 */
export function syncTrips(userId: string): Promise<void> {
  if (inFlight) {
    runAgain = true;
    return inFlight;
  }
  inFlight = runSync(userId).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(userId: string) {
  try {
    const network = await Network.getNetworkStateAsync();
    if (network.isConnected === false || network.isInternetReachable === false) {
      setStatus('offline');
      return;
    }

    setStatus('syncing');
    // A conflict found while uploading is sorted out by downloading again; a few passes at most.
    let passes = 0;
    do {
      runAgain = false;
      passes++;

      const { changes, upTo } = await downloadChanges(userId);
      // Merge into the latest local list, which may have changed while downloading.
      updateTripsFor(userId, (trips) =>
        mergeRemoteTrips(trips, changes, {
          newId: createId,
          copyName: (name) => t('trips.conflictCopy', { name }),
        })
      );
      if (upTo) storage.setItem(syncedUpToKey(userId), upTo);

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
        updateTripsFor(userId, (trips) => markDeletionsSynced(trips, deleted));
      }
      if (changed.length > 0) {
        const { data, error: saveError } = await supabase.rpc('save_trips', { p_trips: changed.map(toSaved) });
        if (saveError) throw saveError;
        const results = data as SaveResult[];
        updateTripsFor(userId, (trips) => markTripsSaved(trips, changed, results));
        if (results.some((result) => result.status === 'conflict') && passes < 3) runAgain = true;
      }
    } while (runAgain);

    setStatus('synced');
  } catch (error) {
    console.warn('Trip sync failed:', error);
    setStatus('error');
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
