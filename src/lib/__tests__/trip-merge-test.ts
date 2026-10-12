import { markDeletionsSynced, markTripsSaved, mergeRemoteTrips, type RemoteChanges } from '../trip-merge';
import type { Trip } from '../trips';

function trip(id: string, updatedAt: number, extra: Partial<Trip> = {}): Trip {
  return { id, name: id, startDate: '2026-10-10', stops: [], createdAt: 1, updatedAt, ...extra };
}

/** A trip as downloaded, with the server's time for its version. */
const remote = (id: string, updatedAt: number, server: string, extra: Partial<Trip> = {}) =>
  trip(id, updatedAt, { serverUpdatedAt: server, ...extra });

const ids = (trips: Trip[]) => trips.map((t) => t.id);
const copies = { newId: () => 'copy-1', copyName: (name: string) => `${name} (copy from this phone)` };
const changed = (trips: Trip[], deletedIds: string[] = []): RemoteChanges => ({ trips, deletedIds, full: false });
const everything = (trips: Trip[], deletedIds: string[] = []): RemoteChanges => ({ trips, deletedIds, full: true });

describe('mergeRemoteTrips', () => {
  it('adds trips from Supabase as synced', () => {
    expect(mergeRemoteTrips([], changed([remote('a', 5, 'v1')]), copies)).toEqual([
      { ...remote('a', 5, 'v1'), dirty: false },
    ]);
  });

  it('takes the server’s version of a trip not changed here', () => {
    const merged = mergeRemoteTrips([remote('a', 5, 'v1')], changed([remote('a', 6, 'v2', { name: 'new' })]), copies);
    expect(merged[0]).toMatchObject({ name: 'new', serverUpdatedAt: 'v2', dirty: false });
  });

  it('keeps a change made only here, to upload, whatever the phone’s clock says', () => {
    // The phone's clock is a year behind, but its edit is based on the server's latest version.
    const mine = remote('a', 1, 'v1', { name: 'mine', dirty: true });
    const merged = mergeRemoteTrips([mine], changed([remote('a', 9_999, 'v1')]), copies);
    expect(merged[0]).toMatchObject({ name: 'mine', dirty: true });
  });

  it('keeps both versions when a trip changed here and elsewhere', () => {
    const mine = remote('a', 9, 'v1', { name: 'Kubu', dirty: true, people: 4 });
    const merged = mergeRemoteTrips([mine], changed([remote('a', 5, 'v2', { name: 'Kubu', people: 2 })]), copies);
    expect(merged.map((t) => [t.id, t.name, t.people, t.dirty, t.serverUpdatedAt])).toEqual([
      // The copy keeps this phone's edit and uploads as a new trip.
      ['copy-1', 'Kubu (copy from this phone)', 4, true, undefined],
      ['a', 'Kubu', 2, false, 'v2'],
    ]);
  });

  it('removes trips deleted anywhere, even with changes here', () => {
    const local = [remote('gone', 1, 'v1', { dirty: true }), remote('b', 2, 'v1')];
    expect(ids(mergeRemoteTrips(local, changed([], ['gone']), copies))).toEqual(['b']);
  });

  it('keeps a deletion made here even if the trip changed elsewhere', () => {
    const local = remote('a', 9, 'v1', { dirty: true, deletedAt: 9 });
    const merged = mergeRemoteTrips([local], changed([remote('a', 5, 'v2')]), copies);
    expect(merged[0]).toMatchObject({ deletedAt: 9, dirty: true, serverUpdatedAt: 'v2' });
  });

  it('only treats missing trips as deleted after a full download', () => {
    const local = [remote('a', 1, 'v1'), remote('b', 2, 'v1')];
    // Only "b" changed since the last sync; "a" is still there.
    expect(ids(mergeRemoteTrips(local, changed([remote('b', 3, 'v2')]), copies))).toEqual(['b', 'a']);
    // A full download without "a": it was deleted before deletions were recorded.
    expect(ids(mergeRemoteTrips(local, everything([remote('b', 3, 'v2')]), copies))).toEqual(['b']);
  });

  it('keeps trips not uploaded yet, newest first', () => {
    const local = [trip('new', 1, { dirty: true }), remote('a', 1, 'v1')];
    expect(ids(mergeRemoteTrips(local, everything([remote('a', 1, 'v1'), remote('b', 3, 'v1')]), copies))).toEqual([
      'b',
      'new',
      'a',
    ]);
  });

  it('merges trips saved by the older app by their edit times, without making copies', () => {
    const olderHere = trip('a', 5, { dirty: true, name: 'local' });
    expect(mergeRemoteTrips([olderHere], changed([remote('a', 9, 'v1', { name: 'remote' })]), copies)).toEqual([
      expect.objectContaining({ name: 'remote', dirty: false }),
    ]);
    const newerHere = trip('a', 9, { dirty: true, name: 'local' });
    expect(mergeRemoteTrips([newerHere], changed([remote('a', 5, 'v1')]), copies)).toEqual([
      expect.objectContaining({ name: 'local', dirty: true, serverUpdatedAt: 'v1' }),
    ]);
  });
});

describe('markTripsSaved', () => {
  it('records the new server time, and marks synced only trips not edited again since', () => {
    const local = [remote('a', 5, 'v1', { dirty: true }), remote('b', 8, 'v1', { dirty: true })];
    const uploaded = [remote('a', 5, 'v1'), remote('b', 6, 'v1')];
    const after = markTripsSaved(local, uploaded, [
      { id: 'a', status: 'saved', updated_at: 'v2' },
      { id: 'b', status: 'saved', updated_at: 'v2' },
    ]);
    expect(after.map((t) => [t.id, t.dirty, t.serverUpdatedAt])).toEqual([
      ['a', false, 'v2'],
      // Edited again during the upload: still to upload, now based on the saved version.
      ['b', true, 'v2'],
    ]);
  });

  it('leaves conflicts for the next download, and drops trips deleted elsewhere', () => {
    const local = [remote('a', 5, 'v1', { dirty: true }), remote('b', 5, 'v1', { dirty: true })];
    const after = markTripsSaved(local, local, [
      { id: 'a', status: 'conflict' },
      { id: 'b', status: 'deleted' },
    ]);
    expect(after).toEqual([local[0]]);
  });
});

describe('markDeletionsSynced', () => {
  it('drops deleted trips once Supabase has the deletion, but not ones deleted again since', () => {
    expect(ids(markDeletionsSynced([trip('a', 9, { dirty: true, deletedAt: 9 }), trip('b', 3)], [trip('a', 9)]))).toEqual([
      'b',
    ]);
    expect(ids(markDeletionsSynced([trip('a', 12, { dirty: true, deletedAt: 12 })], [trip('a', 9)]))).toEqual(['a']);
  });
});
