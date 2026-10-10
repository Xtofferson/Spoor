import type { Stop } from './trips';

/** Later of two `YYYY-MM-DD` dates. These strings compare correctly as text. */
function later(a: string, b: string) {
  return a > b ? a : b;
}

/**
 * Gives every stop the dates its position needs and keeps them in order along the
 * route: the origin only leaves, the destination only arrives, and stops in between
 * arrive then leave. Any date earlier than the one before it is moved up to match,
 * so changing an early date pushes the later ones forward.
 */
export function normalizeStopDates(stops: Stop[], fallbackDate: string): Stop[] {
  let previous: string | undefined;
  return stops.map((stop, index) => {
    const { date: _legacyDate, ...rest } = stop;
    const isFirst = index === 0;
    const isLast = index === stops.length - 1;
    const own = stop.arriveDate ?? stop.departDate ?? stop.date ?? previous ?? fallbackDate;

    if (isFirst) {
      previous = stop.departDate ?? own;
      return { ...rest, arriveDate: undefined, departDate: previous };
    }

    const arriveDate = later(stop.arriveDate ?? own, previous ?? own);
    previous = arriveDate;
    if (isLast) {
      return { ...rest, arriveDate, departDate: undefined };
    }

    const departDate = later(stop.departDate ?? arriveDate, arriveDate);
    previous = departDate;
    return { ...rest, arriveDate, departDate };
  });
}

/** The date just before this stop's arrival (or departure, for the origin), used as a picker minimum. */
export function previousStopDate(stops: Stop[], index: number): string | undefined {
  if (index === 0) return undefined;
  const before = stops[index - 1];
  return before.departDate ?? before.arriveDate;
}

/** The parts of a stop that describe the place, as opposed to when you're there. */
function place({ id, name, coordinates, placeLabel }: Stop) {
  return { id, name, coordinates, placeLabel };
}

/**
 * Moves a stop up or down the route. The schedule stays in place: places (with any
 * pinned location) swap positions but each position keeps its dates, so the dates stay in order.
 */
export function moveStopKeepingDates(stops: Stop[], index: number, offset: -1 | 1): Stop[] {
  const other = index + offset;
  if (other < 0 || other >= stops.length) return stops;
  const next = [...stops];
  next[index] = { ...stops[index], ...place(stops[other]) };
  next[other] = { ...stops[other], ...place(stops[index]) };
  return next;
}
