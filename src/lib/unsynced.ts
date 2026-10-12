import { t as currentT, type Translate } from '@/lib/i18n';
import { pendingPointCount, syncSupplyPoints } from '@/lib/supplies';
import { syncTrips } from '@/lib/trip-sync';
import { getTripsFor } from '@/lib/trips';
import { syncVehicle, vehicleNeedsUpload } from '@/lib/vehicle';

/** What's saved on this phone but hasn't reached the account yet. */
export type Unsynced = { trips: number; vehicle: boolean; places: number };

export function unsyncedChanges(userId: string): Unsynced {
  return {
    trips: getTripsFor(userId).filter((trip) => trip.dirty).length,
    vehicle: vehicleNeedsUpload(userId),
    places: pendingPointCount(userId),
  };
}

export function hasUnsynced({ trips, vehicle, places }: Unsynced): boolean {
  return trips > 0 || vehicle || places > 0;
}

/** One line per kind of change, e.g. "• 2 trips", for the sign-out warning. */
export function unsyncedLines({ trips, vehicle, places }: Unsynced, t: Translate = currentT): string {
  const lines: string[] = [];
  if (trips > 0) lines.push(t('me.unsynced.trips', { count: trips }));
  if (vehicle) lines.push(t('me.unsynced.vehicle'));
  if (places > 0) lines.push(t('me.unsynced.places', { count: places }));
  return lines.map((line) => `• ${line}`).join('\n');
}

/** Uploads everything waiting on this phone, and waits until it's done (or couldn't be). */
export async function syncEverything(userId: string): Promise<void> {
  await Promise.all([syncTrips(userId), syncVehicle(userId), syncSupplyPoints(userId)]);
}
