import type { Trip } from './trips';

/**
 * Merges trips downloaded from Supabase into the local list. The newest edit wins:
 * a remote trip replaces the local copy only when it was updated more recently, so
 * local edits that haven't been uploaded yet survive unless someone edited the same
 * trip later on another device.
 */
export function mergeRemoteTrips(local: Trip[], remote: Trip[]): Trip[] {
  const byId = new Map(local.map((trip) => [trip.id, trip]));
  for (const trip of remote) {
    const existing = byId.get(trip.id);
    if (!existing || trip.updatedAt > existing.updatedAt) {
      byId.set(trip.id, { ...trip, dirty: false });
    }
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Clears the unsynced flag on trips that haven't been edited again since they were uploaded. */
export function markTripsSynced(local: Trip[], uploaded: Trip[]): Trip[] {
  const uploadedAt = new Map(uploaded.map((trip) => [trip.id, trip.updatedAt]));
  return local.map((trip) =>
    trip.dirty && uploadedAt.get(trip.id) === trip.updatedAt ? { ...trip, dirty: false } : trip
  );
}
