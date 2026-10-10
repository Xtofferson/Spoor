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
  /** True when the trip has changes on this phone that haven't been uploaded to Supabase yet. */
  dirty?: boolean;
};

/** Where trips were kept before accounts existed. */
const LEGACY_STORAGE_KEY = 'spoor.trips.v1';
const NO_TRIPS: Trip[] = [];

function storageKey(userId: string) {
  return `spoor.trips.v1.${userId}`;
}

let currentUserId: string | null = null;
let cache: Trip[] = NO_TRIPS;
const listeners = new Set<() => void>();

function load(key: string): Trip[] {
  const raw = storage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

function getTrips(): Trip[] {
  return cache;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Switches the trip list to the signed-in user's trips, or clears it when signed out.
 * Each user's trips are stored separately on the phone.
 */
export function setTripsUser(userId: string | null) {
  if (userId === currentUserId) return;
  currentUserId = userId;

  if (!userId) {
    cache = NO_TRIPS;
    emit();
    return;
  }

  let trips = load(storageKey(userId));
  // Trips saved before sign-in existed go to the first account used on this phone.
  const legacy = load(LEGACY_STORAGE_KEY);
  if (legacy.length > 0) {
    const known = new Set(trips.map((trip) => trip.id));
    const adopted = legacy
      .filter((trip) => !known.has(trip.id))
      .map((trip) => ({ ...trip, dirty: true }));
    trips = [...adopted, ...trips];
    storage.setItem(storageKey(userId), JSON.stringify(trips));
    storage.removeItem(LEGACY_STORAGE_KEY);
  }

  cache = trips;
  emit();
}

/** The signed-in user's trips right now, outside React. */
export function getTripsFor(userId: string): Trip[] {
  return userId === currentUserId ? cache : NO_TRIPS;
}

/**
 * Updates a user's trips and saves them on the phone. Ignored if that user has
 * signed out in the meantime, so a slow sync can't write into another account.
 */
export function updateTripsFor(userId: string, update: (trips: Trip[]) => Trip[]) {
  if (userId !== currentUserId) return;
  cache = update(cache);
  storage.setItem(storageKey(userId), JSON.stringify(cache));
  emit();
}

/** The signed-in user's trips, most recently edited first. */
export function useTrips(): Trip[] {
  return useSyncExternalStore(subscribe, getTrips, () => NO_TRIPS);
}

export function useTrip(id: string | undefined): Trip | undefined {
  return useTrips().find((trip) => trip.id === id);
}

/** Saves a trip on the phone and marks it for upload. */
export function saveTrip(trip: Trip) {
  if (!currentUserId) return;
  updateTripsFor(currentUserId, (trips) => [
    { ...trip, dirty: true },
    ...trips.filter((t) => t.id !== trip.id),
  ]);
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
