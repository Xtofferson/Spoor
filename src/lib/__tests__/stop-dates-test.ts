import { moveStopKeepingDates, normalizeStopDates, previousStopDate } from '../stop-dates';
import type { Stop } from '../trips';

const FALLBACK = '2000-01-01';

/** [name, arrives, leaves] for each stop, with '-' for a date the stop doesn't have. */
function schedule(stops: Stop[]) {
  return stops.map((stop) => [stop.name, stop.arriveDate ?? '-', stop.departDate ?? '-']);
}

const trip: Stop[] = normalizeStopDates(
  [
    { id: '1', name: 'Joburg', departDate: '2026-10-10' },
    { id: '2', name: 'Nata', arriveDate: '2026-10-11', departDate: '2026-10-12' },
    { id: '3', name: 'Kubu', arriveDate: '2026-10-13' },
  ],
  FALLBACK
);

describe('normalizeStopDates', () => {
  it('gives the origin a departure, the destination an arrival and stops in between both', () => {
    expect(schedule(trip)).toEqual([
      ['Joburg', '-', '2026-10-10'],
      ['Nata', '2026-10-11', '2026-10-12'],
      ['Kubu', '2026-10-13', '-'],
    ]);
  });

  it('pushes later dates forward when an earlier one moves past them, and leaves later ones alone', () => {
    const pushed = normalizeStopDates([{ ...trip[0], departDate: '2026-10-12' }, trip[1], trip[2]], FALLBACK);
    expect(schedule(pushed)).toEqual([
      ['Joburg', '-', '2026-10-12'],
      ['Nata', '2026-10-12', '2026-10-12'],
      ['Kubu', '2026-10-13', '-'],
    ]);
  });

  it('turns an old single stop date into arriving and leaving that day, and fills undated stops', () => {
    const legacy = normalizeStopDates(
      [
        { id: '1', name: 'A', departDate: '2026-10-10' },
        { id: '2', name: 'B', date: '2026-10-12' },
        { id: '3', name: 'C' },
        { id: '4', name: 'D', arriveDate: '2026-10-15' },
      ],
      FALLBACK
    );
    expect(schedule(legacy)).toEqual([
      ['A', '-', '2026-10-10'],
      ['B', '2026-10-12', '2026-10-12'],
      ['C', '2026-10-12', '2026-10-12'],
      ['D', '2026-10-15', '-'],
    ]);
    expect('date' in legacy[1]).toBe(false);
  });

  it('keeps departures and arrivals when the origin or destination is removed', () => {
    expect(schedule(normalizeStopDates(trip.slice(1), FALLBACK))).toEqual([
      ['Nata', '-', '2026-10-12'],
      ['Kubu', '2026-10-13', '-'],
    ]);
    expect(schedule(normalizeStopDates(trip.slice(0, 2), FALLBACK))).toEqual([
      ['Joburg', '-', '2026-10-10'],
      ['Nata', '2026-10-11', '-'],
    ]);
  });
});

describe('moveStopKeepingDates', () => {
  it('swaps places but keeps the schedule in place', () => {
    const moved = normalizeStopDates(moveStopKeepingDates(trip, 1, 1), FALLBACK);
    expect(schedule(moved)).toEqual([
      ['Joburg', '-', '2026-10-10'],
      ['Kubu', '2026-10-11', '2026-10-12'],
      ['Nata', '2026-10-13', '-'],
    ]);
  });

  it('moves a pinned location and its label with the place', () => {
    const stops: Stop[] = [
      { id: '1', name: 'A', departDate: '2026-10-10', coordinates: [1, 1] },
      { id: '2', name: 'Nata', arriveDate: '2026-10-11', departDate: '2026-10-11', coordinates: [26.18, -20.21], placeLabel: 'Nata, CT, Botswana' },
      { id: '3', name: 'C', arriveDate: '2026-10-12' },
    ];
    const moved = moveStopKeepingDates(stops, 1, 1);
    expect(moved[2]).toMatchObject({ name: 'Nata', coordinates: [26.18, -20.21], placeLabel: 'Nata, CT, Botswana', arriveDate: '2026-10-12' });
    expect(moved[1]).toMatchObject({ name: 'C', coordinates: undefined, placeLabel: undefined, arriveDate: '2026-10-11' });
  });

  it('ignores moves off either end', () => {
    expect(moveStopKeepingDates(trip, 0, -1)).toBe(trip);
    expect(moveStopKeepingDates(trip, 2, 1)).toBe(trip);
  });
});

describe('previousStopDate', () => {
  it('gives the date each stop’s picker can’t go before', () => {
    expect(previousStopDate(trip, 0)).toBeUndefined();
    expect(previousStopDate(trip, 1)).toBe('2026-10-10');
    expect(previousStopDate(trip, 2)).toBe('2026-10-12');
  });
});
