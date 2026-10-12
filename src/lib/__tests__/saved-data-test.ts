import { keysToRemove } from '../saved-data';

jest.mock('@/lib/storage', () => ({
  storage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, keys: () => [] },
}));

const DAY_MS = 24 * 60 * 60 * 1000;
const now = 20_000 * DAY_MS;
const today = 20_000;
const none = { keep: new Set<string>(), tripIds: new Set<string>(), now };

describe('keysToRemove', () => {
  it('removes old versions and retired kinds, but not the current ones or other data', () => {
    const keys = [
      'spoor.route.v2.a',
      'spoor.route.v3.a',
      'spoor.supplies.v4.x',
      'spoor.supplies.v5.x',
      'spoor.options.1,2>3,4',
      'spoor.options.v2.1,2>3,4',
      'spoor.supplyPoints.v1.user',
      'spoor.trips.v1.user',
      'spoor.vehicle.v1.user',
      'spoor.language.v1',
    ];
    expect(keysToRemove(keys, {}, none).sort()).toEqual([
      'spoor.options.1,2>3,4',
      'spoor.route.v2.a',
      'spoor.supplies.v4.x',
      'spoor.supplyPoints.v1.user',
    ]);
  });

  it('keeps only the most recently used of each kind, unless a trip still uses them', () => {
    // 62 route plans, used on days 0..61 ago; at most 60 are kept.
    const keys = Array.from({ length: 62 }, (_, i) => `spoor.route.v3.${i}`);
    const used = Object.fromEntries(keys.map((key, i) => [key, today - i]));
    expect(keysToRemove(keys, used, none)).toEqual(['spoor.route.v3.60', 'spoor.route.v3.61']);
    expect(keysToRemove(keys, used, { ...none, keep: new Set(['spoor.route.v3.61']) })).toEqual([
      'spoor.route.v3.60',
    ]);
  });

  it('removes lookups not used for 90 days, and counts ones never tracked as used today', () => {
    const keys = ['spoor.place.v1.nata@start', 'spoor.place.v1.maun@start', 'spoor.place.v1.kasane@start'];
    const used = { 'spoor.place.v1.nata@start': today - 91, 'spoor.place.v1.maun@start': today - 89 };
    expect(keysToRemove(keys, used, none)).toEqual(['spoor.place.v1.nata@start']);
  });

  it('removes prep checklists of trips that are gone', () => {
    const keys = ['spoor.prep.v1.trip-1', 'spoor.prep.v1.trip-2'];
    expect(keysToRemove(keys, {}, { ...none, tripIds: new Set(['trip-1']) })).toEqual(['spoor.prep.v1.trip-2']);
  });
});
