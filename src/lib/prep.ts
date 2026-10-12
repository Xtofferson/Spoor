import { useSyncExternalStore } from 'react';

import { storage } from '@/lib/storage';

/**
 * A trip's prep checklist: which of the standard items are done, and the person's own items.
 * Saved on the phone, one entry per trip.
 */
export type PrepItem = { id: string; label: string };
export type PrepList = { done: string[]; own: PrepItem[] };

/** The standard items every trip starts with; their text is translated as `prep.items.<id>`. */
export const STANDARD_PREP = ['papers', 'tyres', 'recovery', 'water', 'firstAid', 'spares'] as const;

const EMPTY: PrepList = { done: [], own: [] };
const key = (tripId: string) => `spoor.prep.v1.${tripId}`;

const lists = new Map<string, PrepList>();
const listeners = new Set<() => void>();

function load(tripId: string): PrepList {
  try {
    const parsed = JSON.parse(storage.getItem(key(tripId)) ?? 'null');
    if (parsed && Array.isArray(parsed.done) && Array.isArray(parsed.own)) return parsed;
  } catch {
    // A broken entry starts again empty.
  }
  return EMPTY;
}

function get(tripId: string): PrepList {
  let list = lists.get(tripId);
  if (!list) {
    list = load(tripId);
    lists.set(tripId, list);
  }
  return list;
}

function save(tripId: string, list: PrepList) {
  lists.set(tripId, list);
  storage.setItem(key(tripId), JSON.stringify(list));
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePrepList(tripId: string): PrepList {
  return useSyncExternalStore(
    subscribe,
    () => get(tripId),
    () => get(tripId)
  );
}

export function togglePrepItem(tripId: string, id: string) {
  const list = get(tripId);
  const done = list.done.includes(id) ? list.done.filter((item) => item !== id) : [...list.done, id];
  save(tripId, { ...list, done });
}

export function addPrepItem(tripId: string, label: string, id: string) {
  const list = get(tripId);
  save(tripId, { ...list, own: [...list.own, { id, label }] });
}

export function removePrepItem(tripId: string, id: string) {
  const list = get(tripId);
  save(tripId, { own: list.own.filter((item) => item.id !== id), done: list.done.filter((item) => item !== id) });
}
