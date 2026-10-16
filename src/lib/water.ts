/**
 * Water planning: how many days each stretch between water points takes, and whether the
 * water carried lasts. Pure functions only, so they can be tested without a phone.
 */
import { t as currentT, type Translate } from './i18n';
import {
  hoursBetween,
  stopsAlong,
  stretchesBetween,
  tripStopsAlong,
  type PlaceStop,
  type RouteLine,
  type Settlement,
  type Stretch,
  type WaterKind,
  type WaterPoint,
} from './route-points';

/** Drinking water per person per day, as asked. */
export const WATER_PER_PERSON_PER_DAY = 5;
/** Driving time that counts as a day of travel: a long day behind the wheel. */
export const DRIVING_HOURS_PER_DAY = 8;
/** A trip stop this close to either end of a stretch is at the water point, so its nights don't count. */
const AT_WATER_POINT_KM = 3;

export type WaterStop = PlaceStop<WaterPoint>;

/** Water points grouped into stops along the route, in order. */
export function waterStopsAlong(
  line: RouteLine,
  points: WaterPoint[],
  settlements: Settlement[] = [],
  t: Translate = currentT
): WaterStop[] {
  return stopsAlong(line, points, (point) => waterKindLabel(point.kind, t), settlements);
}

const KIND_KEYS: Record<WaterKind, string> = {
  'Drinking water': 'drinking',
  'Water point': 'point',
  'Water tap': 'tap',
  Well: 'well',
};

/** A water point's kind in the current language, e.g. "Drinking water" or "Drinkwater". */
export function waterKindLabel(kind: WaterKind, t: Translate = currentT): string {
  return t(`water.kind.${KIND_KEYS[kind]}`);
}

/** Whether a stop's water needs treating: all its water points are wells or springs. */
export function stopNeedsTreating(stop: WaterStop): boolean {
  return stop.places.length > 0 && stop.places.every((place) => place.needsTreating);
}

/** Nights spent at a trip stop, from its arrive and leave dates (`YYYY-MM-DD`). */
export function nightsAt(arriveDate?: string, departDate?: string): number {
  if (!arriveDate || !departDate) return 0;
  const day = (value: string) => {
    const [year, month, date] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, date);
  };
  return Math.max(0, Math.round((day(departDate) - day(arriveDate)) / 86_400_000));
}

export type WaterStretch = Stretch & {
  drivingHours: number;
  nights: number;
  /** Days without a water point: driving (8 hours counts as a day) plus nights at stops on the way. */
  days: number;
  litresNeeded: number;
  status: 'ok' | 'short';
};

/**
 * The route split at each water point, with the water each stretch needs. `nights` gives the
 * nights planned at each trip stop, in route order (the start, stops in between, the end).
 */
export function waterStretches(
  line: RouteLine,
  stops: WaterStop[],
  { people, waterLitres }: { people: number; waterLitres: number },
  nights: number[]
): WaterStretch[] {
  const tripStops = tripStopsAlong(line);
  return stretchesBetween(line, stops).map((stretch) => {
    const drivingHours = hoursBetween(line, stretch.startKm, stretch.endKm);
    // Nights at trip stops inside the stretch, away from the water points at its ends.
    const nightsOnTheWay = tripStops.reduce(
      (sum, stop, index) =>
        stop.km > stretch.startKm + AT_WATER_POINT_KM && stop.km < stretch.endKm - AT_WATER_POINT_KM
          ? sum + (nights[index] ?? 0)
          : sum,
      0
    );
    const days = drivingHours / DRIVING_HOURS_PER_DAY + nightsOnTheWay;
    const litresNeeded = days * WATER_PER_PERSON_PER_DAY * people;
    return {
      ...stretch,
      drivingHours,
      nights: nightsOnTheWay,
      days,
      litresNeeded,
      status: litresNeeded > waterLitres ? 'short' : 'ok',
    };
  });
}

/** "1 day", "2½ days": days rounded up to the half day, as water is planned. */
export function formatDays(days: number, t: Translate = currentT): string {
  const halves = Math.max(1, Math.ceil(days * 2));
  const whole = Math.floor(halves / 2);
  const text = halves % 2 === 0 ? `${whole}` : whole === 0 ? '½' : `${whole}½`;
  // "½ day" and "1 day" are singular; "1½ days" isn't.
  return t('water.days', { count: halves <= 2 ? 1 : 2, days: text });
}

/** The water point a stretch starts at, or undefined when it starts at the trip's start. */
export function waterStopBefore(stretch: Stretch, stops: WaterStop[]): WaterStop | undefined {
  return stops.find((stop) => stop.endKm === stretch.startKm);
}

/**
 * A heading for a stretch the water carried won't last, e.g. "Last known water point before
 * Maun". Water points are often missing from the map, so it says "known".
 */
export function waterTitle(stretch: Stretch, fromStop: WaterStop | undefined, t: Translate = currentT): string {
  return t(fromStop ? 'water.lastBefore' : 'water.noneBefore', { to: stretch.to });
}

/** What to tell the travellers about a stretch the water carried won't last, if anything. */
export function waterAdvice(
  stretch: WaterStretch,
  { people, waterLitres }: { people: number; waterLitres: number },
  fromStop: WaterStop | undefined,
  t: Translate = currentT
): string | undefined {
  if (stretch.status !== 'short') return undefined;
  const fill = !fromStop ? 'water.fillStart' : stopNeedsTreating(fromStop) ? 'water.fillTreat' : 'water.fill';
  return t('water.advice', {
    litres: Math.ceil(stretch.litresNeeded),
    people: t('water.people', { count: people }),
    days: formatDays(stretch.days, t),
    carried: waterLitres,
    fill: t(fill, { from: stretch.from }),
  });
}
