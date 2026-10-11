import { useSyncExternalStore } from 'react';

import { storage } from '@/lib/storage';

/**
 * Which kinds of places are hidden on the route map ("fuel", "water", or a supply category
 * id). Saved on the phone, so the map looks the same next time.
 */
const KEY = 'spoor.hiddenMapLayers.v1';

function load(): string[] {
  try {
    const parsed = JSON.parse(storage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let hidden: string[] | undefined;
const listeners = new Set<() => void>();

function get(): string[] {
  hidden ??= load();
  return hidden;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useHiddenMapLayers(): string[] {
  return useSyncExternalStore(subscribe, get, get);
}

export function toggleMapLayer(id: string) {
  const current = get();
  hidden = current.includes(id) ? current.filter((layer) => layer !== id) : [...current, id];
  storage.setItem(KEY, JSON.stringify(hidden));
  listeners.forEach((listener) => listener());
}
