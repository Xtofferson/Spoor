import { fromDateString, toDateString, tripDays, type Trip } from './trips';

/**
 * Where the trip spends one or more nights in a row: at a stop, or somewhere not planned yet
 * on the way to the next stop. Nights are numbered from 1, the night after leaving.
 */
export type NightStay = {
  firstNight: number;
  lastNight: number;
  /** The first night's date, as `YYYY-MM-DD`. */
  date: string;
} & ({ kind: 'stop'; stopId: string; name: string } | { kind: 'unplanned'; nextStop?: string });

function addDays(date: string, days: number) {
  const day = fromDateString(date);
  day.setDate(day.getDate() + days);
  return toDateString(day);
}

/**
 * Every night of a trip, grouped by where it's spent. A stop holds the nights from its
 * arrival up to the day it's left; nights between stops are "unplanned".
 */
export function tripNights(trip: Pick<Trip, 'startDate' | 'endDate' | 'stops'>): NightStay[] {
  if (!trip.endDate) return [];
  const nights = tripDays(trip.startDate, trip.endDate) - 1;
  const stays: NightStay[] = [];
  for (let night = 1; night <= nights; night++) {
    const date = addDays(trip.startDate, night - 1);
    const stop = trip.stops.find(
      (s) => s.arriveDate && s.departDate && s.arriveDate <= date && date < s.departDate
    );
    const last = stays[stays.length - 1];
    if (stop) {
      if (last?.kind === 'stop' && last.stopId === stop.id && last.lastNight === night - 1) {
        last.lastNight = night;
      } else {
        stays.push({ kind: 'stop', stopId: stop.id, name: stop.name, firstNight: night, lastNight: night, date });
      }
      continue;
    }
    const nextStop = trip.stops.find((s) => s.arriveDate && s.arriveDate > date)?.name;
    if (last?.kind === 'unplanned' && last.nextStop === nextStop && last.lastNight === night - 1) {
      last.lastNight = night;
    } else {
      stays.push({ kind: 'unplanned', nextStop, firstNight: night, lastNight: night, date });
    }
  }
  return stays;
}
