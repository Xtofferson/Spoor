import { storage } from '@/lib/storage';

/**
 * Keeps the data saved on the phone from only ever growing. Route plans, route options,
 * place lookups and supplies along routes are copies of what the servers said, kept so trips
 * still show offline; they can be looked up again. Old versions of them are removed, and of
 * the current ones only the most recently used are kept.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** A saved lookup not used for this long is removed. */
const MAX_UNUSED_DAYS = 90;

/** Each kind of saved lookup: its key prefix, the current version, and how many to keep. */
export const SAVED_LOOKUPS = [
  { prefix: 'spoor.route.', current: 'spoor.route.v3.', keep: 60 },
  { prefix: 'spoor.supplies.', current: 'spoor.supplies.v5.', keep: 40 },
  { prefix: 'spoor.options.', current: 'spoor.options.v2.', keep: 120 },
  { prefix: 'spoor.place.', current: 'spoor.place.v1.', keep: 400 },
] as const;

/** Kinds of data the app no longer uses at all. */
const RETIRED = ['spoor.supplyPoints.'];

const PREP_PREFIX = 'spoor.prep.v1.';
const TRIPS_PREFIX = 'spoor.trips.v1.';

/** When each saved lookup was last used, as days since 1970, so the oldest go first. */
const USE_KEY = 'spoor.savedDataUse.v1';

let lastUsed: Record<string, number> | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const today = (now = Date.now()) => Math.floor(now / DAY_MS);

function uses(): Record<string, number> {
  if (!lastUsed) {
    try {
      lastUsed = JSON.parse(storage.getItem(USE_KEY) ?? '{}') ?? {};
    } catch {
      lastUsed = {};
    }
  }
  return lastUsed!;
}

function saveUses() {
  storage.setItem(USE_KEY, JSON.stringify(uses()));
}

/** Notes that a saved lookup was just read or written, so it's kept over older ones. */
export function markUsed(key: string) {
  const day = today();
  if (uses()[key] === day) return;
  uses()[key] = day;
  // Saved a little later, so reading many entries at once writes this only once.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveUses, 2000);
}

/**
 * Which keys to remove: retired kinds and old versions, then current lookups beyond each
 * kind's limit or unused for 90 days (least recently used first), except `keep`. Prep
 * checklists go once their trip is gone from every account on the phone.
 */
export function keysToRemove(
  keys: string[],
  used: Record<string, number>,
  options: { keep: Set<string>; tripIds: Set<string>; now?: number }
): string[] {
  const day = today(options.now);
  const remove: string[] = [];
  for (const key of keys) {
    if (RETIRED.some((prefix) => key.startsWith(prefix))) remove.push(key);
    else if (key.startsWith(PREP_PREFIX) && !options.tripIds.has(key.slice(PREP_PREFIX.length))) remove.push(key);
  }
  for (const kind of SAVED_LOOKUPS) {
    const ofKind = keys.filter((key) => key.startsWith(kind.prefix));
    remove.push(...ofKind.filter((key) => !key.startsWith(kind.current)));
    const current = ofKind
      .filter((key) => key.startsWith(kind.current))
      // Never seen before (saved before this was tracked): counts as used today.
      .map((key) => ({ key, day: used[key] ?? day }))
      .sort((a, b) => b.day - a.day);
    current.forEach((entry, index) => {
      if (options.keep.has(entry.key)) return;
      if (index >= kind.keep || day - entry.day > MAX_UNUSED_DAYS) remove.push(entry.key);
    });
  }
  return remove;
}

/** Every trip saved on the phone, for any account that has signed in here. */
function savedTrips(keys: string[]): { id: string }[] {
  return keys
    .filter((key) => key.startsWith(TRIPS_PREFIX))
    .flatMap((key) => {
      try {
        const trips = JSON.parse(storage.getItem(key) ?? '[]');
        return Array.isArray(trips) ? trips : [];
      } catch {
        return [];
      }
    });
}

/**
 * Removes saved data the app doesn't need any more. `keepFor` gives the saved lookups a
 * trip still uses (e.g. its route plan), which are never removed. Run once after launch.
 */
export function cleanUpSavedData<T extends { id: string }>(keepFor: (trip: T) => string[]) {
  try {
    const keys = storage.keys();
    const trips = savedTrips(keys) as T[];
    const used = uses();
    const remove = keysToRemove(keys, used, {
      keep: new Set(trips.flatMap(keepFor)),
      tripIds: new Set(trips.map((trip) => trip.id)),
    });
    const removed = new Set(remove);
    removed.forEach((key) => {
      storage.removeItem(key);
      delete used[key];
    });
    // Forget keys that are gone, and start the clock on ones seen for the first time.
    const present = new Set(keys);
    for (const key of Object.keys(used)) if (!present.has(key)) delete used[key];
    const day = today();
    for (const kind of SAVED_LOOKUPS) {
      for (const key of keys) {
        if (key.startsWith(kind.current) && !removed.has(key)) used[key] ??= day;
      }
    }
    saveUses();
  } catch (error) {
    console.warn('Cleaning up saved data failed:', error);
  }
}
