import { useSyncExternalStore } from 'react';

import { storage } from '@/lib/storage';

export type Stop = {
  id: string;
  name: string;
};

export type Trip = {
  id: string;
  name: string;
  /** Local calendar date as `YYYY-MM-DD`, so it never shifts with time zones. */
  startDate: string;
  /** Ordered stops: the first is the start, the last is the end. */
  stops: Stop[];
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = 'spoor.trips.v1';
const NO_TRIPS: Trip[] = [];

let cache: Trip[] | null = null;
const listeners = new Set<() => void>();

function load(): Trip[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getTrips(): Trip[] {
  cache ??= load();
  return cache;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setTrips(next: Trip[]) {
  cache = next;
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

/** All saved trips, most recently edited first. */
export function useTrips(): Trip[] {
  return useSyncExternalStore(subscribe, getTrips, () => NO_TRIPS);
}

export function useTrip(id: string | undefined): Trip | undefined {
  return useTrips().find((trip) => trip.id === id);
}

export function saveTrip(trip: Trip) {
  const others = getTrips().filter((t) => t.id !== trip.id);
  setTrips([trip, ...others]);
}

export function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function toDateString(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function fromDateString(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDate(value: string) {
  return fromDateString(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
