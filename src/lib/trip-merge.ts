import type { Trip } from './trips';

/**
 * Merges trips downloaded from Supabase into the local list. The newest edit wins:
 * a remote trip replaces the local copy only when it was updated more recently, so
 * local edits (and deletions) that haven't been uploaded yet survive unless someone
 * changed the same trip later on another device.
 */
export function mergeRemoteTrips(local: Trip[], remote: Trip[]): Trip[] {
  const remoteIds = new Set(remote.map((trip) => trip.id));
  // A synced trip that's no longer in Supabase was deleted on another device.
  const kept = local.filter((trip) => trip.dirty || remoteIds.has(trip.id));

  const byId = new Map(kept.map((trip) => [trip.id, trip]));
  for (const trip of remote) {
    const existing = byId.get(trip.id);
    if (!existing || trip.updatedAt > existing.updatedAt) {
      byId.set(trip.id, { ...trip, dirty: false });
    }
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Updates the local list after an upload: trips that haven't changed again since
 * are marked synced, and deleted trips are dropped now that Supabase has the deletion.
 */
export function markTripsSynced(local: Trip[], uploaded: Trip[]): Trip[] {
  const uploadedAt = new Map(uploaded.map((trip) => [trip.id, trip.updatedAt]));
  const isUploaded = (trip: Trip) => trip.dirty && uploadedAt.get(trip.id) === trip.updatedAt;
  return local
    .filter((trip) => !(trip.deletedAt && isUploaded(trip)))
    .map((trip) => (isUploaded(trip) ? { ...trip, dirty: false } : trip));
}
