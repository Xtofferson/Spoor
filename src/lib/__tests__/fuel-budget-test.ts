import { countryAt, type CountryCode } from '../countries';
import type { Vehicle } from '../fuel';
import { fuelBudget, formatRand, oldestPriceDate } from '../fuel-budget';
import { BUILT_IN_PRICES, priceIn, priceListFromRows } from '../fuel-prices';
import { buildRouteLine } from '../route-points';

jest.mock('@/lib/storage', () => ({
  storage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, keys: () => [] },
}));

const landCruiser: Vehicle = {
  name: 'Land Cruiser 79',
  mainTankLitres: 130,
  jerryCanLitres: 40,
  consumption: { tar: 13, gravel: 15, sand: 19 },
  updatedAt: 1,
};
const allTar = { tar: 1, gravel: 0, unpaved: 0, unknown: 0 };
const allSand = { tar: 0, gravel: 0, unpaved: 1, unknown: 0 };

describe('countryAt', () => {
  it('finds the country of places in southern Africa', () => {
    expect(countryAt([28.05, -26.2])).toBe('ZA'); // Johannesburg
    expect(countryAt([25.91, -24.65])).toBe('BW'); // Gaborone
    expect(countryAt([17.08, -22.56])).toBe('NA'); // Windhoek
    expect(countryAt([31.05, -17.83])).toBe('ZW'); // Harare
    expect(countryAt([28.28, -15.42])).toBe('ZM'); // Lusaka
    expect(countryAt([32.57, -25.97])).toBe('MZ'); // Maputo
    expect(countryAt([31.13, -26.31])).toBe('SZ'); // Mbabane
  });

  it('knows Lesotho is not South Africa, though South Africa surrounds it', () => {
    expect(countryAt([27.48, -29.31])).toBe('LS'); // Maseru
  });

  it('is undefined at sea and outside the region', () => {
    expect(countryAt([10, -30])).toBeUndefined();
    expect(countryAt([36.82, -1.29])).toBeUndefined(); // Nairobi
  });
});

describe('fuelBudget', () => {
  // A → B is 300 km of tar in "ZA", B → C 100 km of sand in "BW" (by longitude).
  const line = buildRouteLine([
    { from: 'A', to: 'B', distance: 300_000, surface: allTar, geometry: [[20, 0], [22.7, 0]] },
    { from: 'B', to: 'C', distance: 100_000, surface: allSand, geometry: [[22.7, 0], [23.6, 0]] },
  ]);
  const countryOf = ([lon]: [number, number]): CountryCode => (lon < 23 ? 'ZA' : 'BW');

  it('without fuel stops, refills each leg where it ends, at that country’s price', () => {
    const list = { ZA: { diesel: { price: 30, asOf: '2026-10-07' } }, BW: { diesel: { price: 25, asOf: '2026-10-05' } } };
    const budget = fuelBudget(line, [], landCruiser, 'diesel', {}, list, countryOf);
    expect(budget.lines.map((l) => [l.country, Math.round(l.litres), l.pricePerLitre, l.source])).toEqual([
      ['ZA', 39, 30, 'estimate'],
      ['BW', 19, 25, 'estimate'],
    ]);
    expect(budget.litres).toBeCloseTo(58);
    expect(budget.total).toBeCloseTo(39 * 30 + 19 * 25);
    // The budget says how current it is by its oldest price.
    expect(oldestPriceDate(budget)).toBe('2026-10-05');
  });

  it('buys each stretch’s fuel at the fuel stop that ends it, and uses the person’s own prices', () => {
    // One fill-up at km 350 (in "BW"), then on to the end.
    const refills = [
      { startKm: 0, endKm: 350 },
      { startKm: 350, endKm: 400 },
    ];
    const budget = fuelBudget(line, refills, landCruiser, 'petrol', { BW: { petrol: 20 } }, BUILT_IN_PRICES, countryOf);
    expect(budget.lines).toEqual([
      expect.objectContaining({ country: 'BW', pricePerLitre: 20, source: 'own' }),
    ]);
    expect(budget.litres).toBeCloseTo(58);
    expect(budget.total).toBeCloseTo(58 * 20);
    expect(oldestPriceDate(budget)).toBeUndefined();
  });
});

describe('priceIn', () => {
  const list = { ZA: { diesel: { price: 33, asOf: '2026-10-07' } }, LS: { petrol: { price: 29, asOf: '2026-10-01' } } };

  it('prefers the person’s own price, then the list’s', () => {
    expect(priceIn('LS', 'diesel', { LS: { diesel: 30 } }, list)).toEqual({ price: 30, source: 'own' });
    expect(priceIn('LS', 'petrol', {}, list)).toEqual({ price: 29, source: 'estimate', asOf: '2026-10-01' });
  });

  it('uses South Africa’s price for a country without one, and says so', () => {
    expect(priceIn('LS', 'diesel', {}, list)).toEqual({ price: 33, source: 'fallback', asOf: '2026-10-07' });
    expect(priceIn('LS', 'diesel', { ZA: { diesel: 31 } }, list)).toEqual({ price: 31, source: 'fallback' });
  });

  it('falls back to the built-in South African price if the list has none', () => {
    expect(priceIn(undefined, 'diesel', {}, {})).toEqual({
      price: BUILT_IN_PRICES.ZA!.diesel!.price,
      source: 'fallback',
      asOf: BUILT_IN_PRICES.ZA!.diesel!.asOf,
    });
  });
});

describe('priceListFromRows', () => {
  it('reads Supabase rows, skipping unknown countries, fuels and broken prices', () => {
    const rows = [
      { country: 'ZA', fuel: 'diesel', price_rand: '33.29', as_of: '2026-10-07' },
      { country: 'ZA', fuel: 'petrol', price_rand: 30.25, as_of: '2026-10-07' },
      { country: 'KE', fuel: 'diesel', price_rand: 25, as_of: '2026-10-07' },
      { country: 'BW', fuel: 'paraffin', price_rand: 15, as_of: '2026-10-07' },
      { country: 'BW', fuel: 'diesel', price_rand: 'lots', as_of: '2026-10-07' },
    ];
    expect(priceListFromRows(rows, ['ZA', 'BW'])).toEqual({
      ZA: { diesel: { price: 33.29, asOf: '2026-10-07' }, petrol: { price: 30.25, asOf: '2026-10-07' } },
    });
  });
});

describe('formatRand', () => {
  it('rounds to the nearest R10', () => {
    expect(formatRand(4846)).toBe('R4,850');
  });
});
