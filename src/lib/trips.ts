import { useSyncExternalStore } from 'react';

import type { FuelStopChoice } from '@/lib/fuel';
import type { ChosenRoute, LonLat } from '@/lib/route-math';
import { dateLocale } from '@/lib/i18n';
import { storage } from '@/lib/storage';

export type Stop = {
  id: string;
  name: string;
  /** Day of arrival, as `YYYY-MM-DD`. Not used for the origin. */
  arriveDate?: string;
  /** Day of departure, as `YYYY-MM-DD`. Not used for the final destination. */
  departDate?: string;
  /** Single stop date from an earlier version; read once and replaced by the two above. */
  date?: string;
  /**
   * Exact location, picked on the map or chosen from search suggestions. When set, it's
   * used instead of searching for the name.
   */
  coordinates?: LonLat;
  /** The suggestion the location came from, e.g. "Nata, CT, Botswana". Unset for map pins. */
  placeLabel?: string;
  /** The route chosen for the leg arriving here, from the Route tab's route options. */
  route?: ChosenRoute;
};

export type Trip = {
  id: string;
  name: string;
  /** Local calendar date as `YYYY-MM-DD`, so it never shifts with time zones. */
  startDate: string;
  /** Last day of the trip, as `YYYY-MM-DD`. Missing on trips saved before end dates existed. */
  endDate?: string;
  /** Ordered stops: the first is the start, the last is the end. */
  stops: Stop[];
  /** People travelling, for planning water. Missing on trips saved before it was asked for. */
  people?: number;
  /** Towns (fuel stops) chosen to fill up at. Fuel is planned between these, or every stop if none. */
  fuelStops?: FuelStopChoice[];
  createdAt: number;
  /** When it was last edited, by the phone's clock; used for sorting. */
  updatedAt: number;
  /**
   * The server's updated_at for the version this phone last downloaded or uploaded. Supabase
   * only accepts changes based on its latest version. Missing until the trip first syncs.
   */
  serverUpdatedAt?: string;
  /** True when the trip has changes on this phone that haven't been uploaded to Supabase yet. */
  dirty?: boolean;
  /**
   * Set when the trip is deleted. The trip stays hidden on the phone until the deletion
   * has reached Supabase; otherwise the next sync would download it again.
   */
  deletedAt?: number;
};

/** Where trips were kept before accounts existed. */
const LEGACY_STORAGE_KEY = 'spoor.trips.v1';
const NO_TRIPS: Trip[] = [];

function storageKey(userId: string) {
  return `spoor.trips.v1.${userId}`;
}

let currentUserId: string | null = null;
/** Every trip on the phone for the current user, including deleted ones waiting to sync. */
let cache: Trip[] = NO_TRIPS;
/** The trips to show: `cache` without deleted ones. Kept as one array so React sees a stable value. */
let visible: Trip[] = NO_TRIPS;
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

function setCache(next: Trip[]) {
  cache = next;
  visible = next.some((trip) => trip.deletedAt) ? next.filter((trip) => !trip.deletedAt) : next;
}

function getVisibleTrips(): Trip[] {
  return visible;
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
    setCache(NO_TRIPS);
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

  setCache(trips);
  emit();
}

/** All of the signed-in user's trips right now, including deleted ones waiting to sync. */
export function getTripsFor(userId: string): Trip[] {
  return userId === currentUserId ? cache : NO_TRIPS;
}

/**
 * Updates a user's trips and saves them on the phone. Ignored if that user has
 * signed out in the meantime, so a slow sync can't write into another account.
 */
export function updateTripsFor(userId: string, update: (trips: Trip[]) => Trip[]) {
  if (userId !== currentUserId) return;
  setCache(update(cache));
  storage.setItem(storageKey(userId), JSON.stringify(cache));
  emit();
}

/** The signed-in user's trips, most recently edited first. */
export function useTrips(): Trip[] {
  return useSyncExternalStore(subscribe, getVisibleTrips, () => NO_TRIPS);
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

/** Saves the trip's chosen fuel stops. */
/** Most people on one trip, matching the limit in Supabase. */
export const MAX_PEOPLE = 20;

export function saveTripPeople(trip: Trip, people: number) {
  saveTrip({ ...trip, people, updatedAt: Date.now() });
}

export function saveFuelStops(trip: Trip, fuelStops: FuelStopChoice[]) {
  saveTrip({ ...trip, fuelStops: fuelStops.length > 0 ? fuelStops : undefined, updatedAt: Date.now() });
}

/** Deletes a trip on the phone; the deletion is uploaded on the next sync. */
export function deleteTrip(id: string) {
  if (!currentUserId) return;
  const now = Date.now();
  updateTripsFor(currentUserId, (trips) =>
    trips.map((trip) =>
      trip.id === id ? { ...trip, deletedAt: now, updatedAt: now, dirty: true } : trip
    )
  );
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

/** e.g. "10 Oct 2026". `locale` defaults to the app's language. */
export function formatDate(value: string, locale = dateLocale()) {
  return fromDateString(value).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Number of days a trip spans, counting both the first and last day. */
export function tripDays(startDate: string, endDate: string) {
  const ms = fromDateString(endDate).getTime() - fromDateString(startDate).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** e.g. "10 – 15 Oct 2026", or "28 Oct – 2 Nov 2026" across months. */
export function formatDateRange(startDate: string, endDate: string, locale = dateLocale()) {
  const start = fromDateString(startDate);
  const end = fromDateString(endDate);
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const startText = start.toLocaleDateString(locale, {
    day: 'numeric',
    month: sameMonth ? undefined : 'short',
    year: sameYear ? undefined : 'numeric',
  });
  return `${startText} – ${formatDate(endDate, locale)}`;
}

/** "Good morning", "Good afternoon" or "Good evening", by the phone's clock. */
export function greetingKey(hour: number) {
  if (hour < 12) return 'home.morning';
  if (hour < 18) return 'home.afternoon';
  return 'home.evening';
}

/** Trips still to come (or under way), soonest first, and past trips, latest first. */
export function splitTrips(trips: Trip[], today: string) {
  const ends = (trip: Trip) => trip.endDate ?? trip.startDate;
  const upcoming = trips.filter((trip) => ends(trip) >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = trips.filter((trip) => ends(trip) < today).sort((a, b) => b.startDate.localeCompare(a.startDate));
  return { upcoming, past };
}
