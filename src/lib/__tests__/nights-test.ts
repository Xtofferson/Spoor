import { tripNights } from '../nights';

const stop = (id: string, arriveDate?: string, departDate?: string) => ({ id, name: id, arriveDate, departDate });

describe('tripNights', () => {
  it('groups nights by the stop they’re spent at', () => {
    const nights = tripNights({
      startDate: '2026-11-14',
      endDate: '2026-11-18',
      stops: [
        stop('Joburg', undefined, '2026-11-14'),
        stop('Khama', '2026-11-14', '2026-11-15'),
        stop('Kubu', '2026-11-15', '2026-11-17'),
        stop('Nata', '2026-11-17', '2026-11-18'),
        stop('Maun', '2026-11-18'),
      ],
    });
    expect(nights.map((n) => [n.kind === 'stop' && n.name, n.firstNight, n.lastNight, n.date])).toEqual([
      ['Khama', 1, 1, '2026-11-14'],
      ['Kubu', 2, 3, '2026-11-15'],
      ['Nata', 4, 4, '2026-11-17'],
    ]);
  });

  it('marks nights between stops as not planned yet, on the way to the next stop', () => {
    const nights = tripNights({
      startDate: '2026-11-14',
      endDate: '2026-11-17',
      stops: [stop('Joburg', undefined, '2026-11-14'), stop('Kubu', '2026-11-16', '2026-11-17'), stop('Maun', '2026-11-17')],
    });
    expect(nights).toEqual([
      { kind: 'unplanned', nextStop: 'Kubu', firstNight: 1, lastNight: 2, date: '2026-11-14' },
      { kind: 'stop', stopId: 'Kubu', name: 'Kubu', firstNight: 3, lastNight: 3, date: '2026-11-16' },
    ]);
  });

  it('has no nights for a day trip or a trip without an end date', () => {
    expect(tripNights({ startDate: '2026-11-14', endDate: '2026-11-14', stops: [] })).toEqual([]);
    expect(tripNights({ startDate: '2026-11-14', stops: [] })).toEqual([]);
  });
});
