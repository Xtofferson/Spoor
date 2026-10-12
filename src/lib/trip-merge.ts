import type { Trip } from './trips';

/** What a sync downloaded: changed trips, deleted trip ids, and whether it was everything. */
export type RemoteChanges = {
  trips: Trip[];
  deletedIds: string[];
  /** True when every trip was downloaded, not only the ones changed since the last sync. */
  full: boolean;
};

/** How a conflict copy is made: its new id and name, e.g. "Kubu (copy from this phone)". */
export type CopyMaker = { newId: () => string; copyName: (name: string) => string };

/**
 * Merges what was downloaded from Supabase into the phone's trips.
 *
 * - A trip deleted anywhere is removed here, even with unsynced changes: deletions win.
 * - A trip changed only on the server replaces the phone's copy.
 * - A trip changed only here (its server version is the one it was based on) is kept, to upload.
 * - A trip changed in both places keeps the server's version, and the phone's changes become a
 *   separate trip ("… (copy from this phone)"), so nothing is lost.
 * - Synced trips missing from a full download were deleted before deletions were recorded.
 */
export function mergeRemoteTrips(local: Trip[], changes: RemoteChanges, copies: CopyMaker): Trip[] {
  const deleted = new Set(changes.deletedIds);
  const remoteIds = new Set(changes.trips.map((trip) => trip.id));
  let kept = local.filter((trip) => !deleted.has(trip.id));
  if (changes.full) kept = kept.filter((trip) => trip.dirty || remoteIds.has(trip.id));

  const byId = new Map(kept.map((trip) => [trip.id, trip]));
  const conflictCopies: Trip[] = [];
  for (const remote of changes.trips) {
    if (deleted.has(remote.id)) continue;
    const mine = byId.get(remote.id);
    if (!mine || !mine.dirty) {
      byId.set(remote.id, { ...remote, dirty: false });
    } else if (mine.serverUpdatedAt === remote.serverUpdatedAt) {
      // Changed only here: keep it for upload.
    } else if (mine.serverUpdatedAt === undefined) {
      // Saved by an older version of the app, before server times: the newer edit wins, and
      // the phone's copy is now based on the server's version so it can be uploaded.
      byId.set(
        remote.id,
        remote.updatedAt > mine.updatedAt
          ? { ...remote, dirty: false }
          : { ...mine, serverUpdatedAt: remote.serverUpdatedAt }
      );
    } else if (mine.deletedAt) {
      // Deleted here after it changed elsewhere: the deletion still wins when it uploads.
      byId.set(remote.id, { ...mine, serverUpdatedAt: remote.serverUpdatedAt });
    } else {
      byId.set(remote.id, { ...remote, dirty: false });
      conflictCopies.push({
        ...mine,
        id: copies.newId(),
        name: copies.copyName(mine.name),
        serverUpdatedAt: undefined,
        dirty: true,
      });
    }
  }
  return [...byId.values(), ...conflictCopies].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** What save_trips said about one trip. */
export type SaveResult = { id: string; status: 'saved' | 'conflict' | 'deleted'; updated_at?: string };

/**
 * Updates the phone's trips after an upload. Saved trips get their new server time, and are
 * marked synced unless they changed again meanwhile. Deleted trips go. Conflicts stay as they
 * are; the next download sorts them out.
 */
export function markTripsSaved(local: Trip[], uploaded: Trip[], results: SaveResult[]): Trip[] {
  const uploadedAt = new Map(uploaded.map((trip) => [trip.id, trip.updatedAt]));
  const byId = new Map(results.map((result) => [result.id, result]));
  return local
    .filter((trip) => byId.get(trip.id)?.status !== 'deleted')
    .map((trip) => {
      const result = byId.get(trip.id);
      if (result?.status !== 'saved') return trip;
      const unchanged = trip.dirty && uploadedAt.get(trip.id) === trip.updatedAt;
      // Even if it changed again, the server now has the uploaded version to build on.
      return { ...trip, serverUpdatedAt: result.updated_at, ...(unchanged && { dirty: false }) };
    });
}

/** Drops trips deleted on the phone once Supabase has the deletion, unless deleted again since. */
export function markDeletionsSynced(local: Trip[], uploaded: Trip[]): Trip[] {
  const uploadedAt = new Map(uploaded.map((trip) => [trip.id, trip.updatedAt]));
  return local.filter((trip) => !(trip.deletedAt && trip.dirty && uploadedAt.get(trip.id) === trip.updatedAt));
}
