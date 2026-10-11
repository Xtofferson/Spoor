import { markTripsSynced, mergeRemoteTrips } from '../trip-merge';
import type { Trip } from '../trips';

function trip(id: string, updatedAt: number, extra: Partial<Trip> = {}): Trip {
  return { id, name: id, startDate: '2026-10-10', stops: [], createdAt: 1, updatedAt, ...extra };
}

const ids = (trips: Trip[]) => trips.map((t) => t.id);

describe('mergeRemoteTrips', () => {
  it('adds trips from Supabase as synced', () => {
    expect(mergeRemoteTrips([], [trip('a', 5)])).toEqual([{ ...trip('a', 5), dirty: false }]);
  });

  it('lets the newer edit win', () => {
    const local = trip('a', 5, { dirty: true, name: 'local' });
    expect(mergeRemoteTrips([local], [trip('a', 9, { name: 'remote' })])[0].name).toBe('remote');

    const newerLocal = trip('a', 9, { dirty: true, name: 'local' });
    const merged = mergeRemoteTrips([newerLocal], [trip('a', 5)])[0];
    expect(merged).toMatchObject({ name: 'local', dirty: true });
  });

  it('keeps the local copy on a tie, so it gets uploaded', () => {
    expect(mergeRemoteTrips([trip('a', 5, { dirty: true, name: 'local' })], [trip('a', 5)])[0].name).toBe('local');
  });

  it('keeps unsynced local trips, newest first', () => {
    expect(ids(mergeRemoteTrips([trip('new', 1, { dirty: true }), trip('a', 1)], [trip('a', 1), trip('b', 3)]))).toEqual([
      'b',
      'new',
      'a',
    ]);
  });

  it('removes synced trips that were deleted on another device', () => {
    expect(ids(mergeRemoteTrips([trip('gone', 1), trip('b', 2)], [trip('b', 2)]))).toEqual(['b']);
  });

  it('doesn’t bring back a trip deleted here but not yet synced', () => {
    const merged = mergeRemoteTrips([trip('a', 9, { dirty: true, deletedAt: 9 })], [trip('a', 5)]);
    expect(merged[0]).toMatchObject({ deletedAt: 9, dirty: true });
  });

  it('lets an edit made elsewhere after a deletion win', () => {
    expect(mergeRemoteTrips([trip('a', 5, { dirty: true, deletedAt: 5 })], [trip('a', 9)])[0].deletedAt).toBeUndefined();
  });
});

describe('markTripsSynced', () => {
  it('marks only trips not edited again since the upload', () => {
    const after = markTripsSynced([trip('a', 5, { dirty: true }), trip('b', 8, { dirty: true })], [trip('a', 5), trip('b', 6)]);
    expect(after.map((t) => [t.id, t.dirty])).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });

  it('drops deleted trips once Supabase has the deletion, but not ones deleted after the upload started', () => {
    expect(ids(markTripsSynced([trip('a', 9, { dirty: true, deletedAt: 9 }), trip('b', 3)], [trip('a', 9)]))).toEqual(['b']);
    expect(ids(markTripsSynced([trip('a', 12, { dirty: true, deletedAt: 12 })], [trip('a', 9)]))).toEqual(['a']);
  });
});
