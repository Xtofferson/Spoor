/**
 * Water planning: how many days each stretch between water points takes, and whether the
 * water carried lasts. Pure functions only, so they can be tested without a phone.
 */
import {
  hoursBetween,
  stopsAlong,
  stretchesBetween,
  tripStopsAlong,
  type PlaceStop,
  type RouteLine,
  type Settlement,
  type Stretch,
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
export function waterStopsAlong(line: RouteLine, points: WaterPoint[], settlements: Settlement[] = []): WaterStop[] {
  return stopsAlong(line, points, (point) => point.kind, settlements);
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
export function formatDays(days: number): string {
  const halves = Math.max(1, Math.ceil(days * 2));
  const whole = Math.floor(halves / 2);
  const text = halves % 2 === 0 ? `${whole}` : whole === 0 ? '½' : `${whole}½`;
  return `${text} ${halves <= 2 ? 'day' : 'days'}`;
}

/** What to tell the travellers about a stretch the water carried won't last, if anything. */
export function waterAdvice(
  stretch: WaterStretch,
  { people, waterLitres }: { people: number; waterLitres: number },
  fromNeedsTreating: boolean
): string | undefined {
  if (stretch.status !== 'short') return undefined;
  const who = `${people} ${people === 1 ? 'person' : 'people'}`;
  const fill = fromNeedsTreating
    ? `Fill up at ${stretch.from} (treat it first) and carry more.`
    : `Fill up at ${stretch.from} and carry more.`;
  return (
    `Needs about ${Math.ceil(stretch.litresNeeded)} L of water for ${who} over ${formatDays(stretch.days)}; ` +
    `you carry ${waterLitres} L. ${fill}`
  );
}
