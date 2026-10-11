import { formatDateRange, fromDateString, toDateString, tripDays, type Trip } from '../trips';

// The trip store saves to the phone; here it saves to a plain map instead.
// (Jest only lets a mock use outside variables whose names start with `mock`.)
const mockSaved = new Map<string, string>();
jest.mock('@/lib/storage', () => ({
  storage: {
    getItem: (key: string) => mockSaved.get(key) ?? null,
    setItem: (key: string, value: string) => void mockSaved.set(key, value),
    removeItem: (key: string) => void mockSaved.delete(key),
  },
}));

// The store keeps the signed-in user in module state, so each test loads a fresh copy,
// as the app does when it starts. What it saved stays in mockSaved.
function loadStore() {
  jest.resetModules();
  return jest.requireActual<typeof import('../trips')>('../trips');
}

function trip(id: string, extra: Partial<Trip> = {}): Trip {
  return { id, name: id, startDate: '2026-10-10', stops: [], createdAt: 1, updatedAt: 1, ...extra };
}

beforeEach(() => mockSaved.clear());

describe('trip store', () => {
  it('keeps each user’s trips separately', () => {
    const store = loadStore();
    store.setTripsUser('ann');
    store.saveTrip(trip('a'));
    store.setTripsUser('ben');
    expect(store.getTripsFor('ben')).toEqual([]);
    store.setTripsUser('ann');
    expect(store.getTripsFor('ann').map((t) => t.id)).toEqual(['a']);
  });

  it('marks saved trips for upload and puts the latest first', () => {
    const store = loadStore();
    store.setTripsUser('ann');
    store.saveTrip(trip('a'));
    store.saveTrip(trip('b'));
    expect(store.getTripsFor('ann').map((t) => [t.id, t.dirty])).toEqual([
      ['b', true],
      ['a', true],
    ]);
  });

  it('keeps trips after the app restarts', () => {
    loadStore().setTripsUser('ann');
    const first = loadStore();
    first.setTripsUser('ann');
    first.saveTrip(trip('a'));
    const restarted = loadStore();
    restarted.setTripsUser('ann');
    expect(restarted.getTripsFor('ann').map((t) => t.id)).toEqual(['a']);
  });

  it('gives trips saved before sign-in existed to the first account, once', () => {
    mockSaved.set('spoor.trips.v1', JSON.stringify([trip('old')]));
    const store = loadStore();
    store.setTripsUser('ann');
    expect(store.getTripsFor('ann').map((t) => [t.id, t.dirty])).toEqual([['old', true]]);
    expect(mockSaved.has('spoor.trips.v1')).toBe(false);
    store.setTripsUser('ben');
    expect(store.getTripsFor('ben')).toEqual([]);
  });

  it('hides a deleted trip but keeps it until the deletion is uploaded', () => {
    const store = loadStore();
    store.setTripsUser('ann');
    store.saveTrip(trip('a'));
    store.deleteTrip('a');
    const [kept] = store.getTripsFor('ann');
    expect(kept).toMatchObject({ id: 'a', dirty: true });
    expect(kept.deletedAt).toEqual(expect.any(Number));
  });

  it('ignores updates for a user who has signed out', () => {
    const store = loadStore();
    store.setTripsUser('ann');
    store.setTripsUser(null);
    store.updateTripsFor('ann', () => [trip('late')]);
    store.setTripsUser('ann');
    expect(store.getTripsFor('ann')).toEqual([]);
  });

  it('ignores corrupt saved data', () => {
    mockSaved.set('spoor.trips.v1.ann', '{not json');
    const store = loadStore();
    store.setTripsUser('ann');
    expect(store.getTripsFor('ann')).toEqual([]);
  });
});

describe('dates', () => {
  it('counts both the first and last day', () => {
    expect(tripDays('2026-10-10', '2026-10-15')).toBe(6);
    expect(tripDays('2026-10-10', '2026-10-10')).toBe(1);
    // Across a daylight-saving change in some time zones.
    expect(tripDays('2026-03-28', '2026-04-02')).toBe(6);
  });

  it('round-trips dates without shifting the day', () => {
    expect(toDateString(fromDateString('2026-12-31'))).toBe('2026-12-31');
  });

  // The wording follows the phone's language, so only check what every language includes.
  it('formats ranges with both days and the year once', () => {
    const range = formatDateRange('2026-10-10', '2026-10-15');
    expect(range).toMatch(/10.*–.*15/);
    expect(range.match(/2026/g)).toHaveLength(1);
    expect(formatDateRange('2026-12-30', '2027-01-02')).toMatch(/2026.*–.*2027/);
  });
});
