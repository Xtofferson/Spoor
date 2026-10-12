import { countryAt, type CountryCode } from '../countries';
import type { Vehicle } from '../fuel';
import { fuelBudget, formatRand } from '../fuel-budget';
import { ESTIMATED_PRICES, priceIn } from '../fuel-prices';
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
    const budget = fuelBudget(line, [], landCruiser, 'diesel', {}, countryOf);
    expect(budget.lines.map((l) => [l.country, Math.round(l.litres), l.pricePerLitre, l.source])).toEqual([
      ['ZA', 39, ESTIMATED_PRICES.ZA!.diesel, 'estimate'],
      ['BW', 19, ESTIMATED_PRICES.BW!.diesel, 'estimate'],
    ]);
    expect(budget.litres).toBeCloseTo(58);
    expect(budget.total).toBeCloseTo(39 * ESTIMATED_PRICES.ZA!.diesel! + 19 * ESTIMATED_PRICES.BW!.diesel!);
  });

  it('buys each stretch’s fuel at the fuel stop that ends it, and uses the person’s own prices', () => {
    // One fill-up at km 350 (in "BW"), then on to the end.
    const refills = [
      { startKm: 0, endKm: 350 },
      { startKm: 350, endKm: 400 },
    ];
    const budget = fuelBudget(line, refills, landCruiser, 'petrol', { BW: { petrol: 20 } }, countryOf);
    expect(budget.lines).toEqual([
      expect.objectContaining({ country: 'BW', pricePerLitre: 20, source: 'own' }),
    ]);
    expect(budget.litres).toBeCloseTo(58);
    expect(budget.total).toBeCloseTo(58 * 20);
  });
});

describe('priceIn', () => {
  it('uses South Africa’s price for a country without one, and says so', () => {
    expect(priceIn('LS', 'diesel', {})).toEqual({ price: ESTIMATED_PRICES.ZA!.diesel, source: 'fallback' });
    expect(priceIn('LS', 'diesel', { ZA: { diesel: 31 } })).toEqual({ price: 31, source: 'fallback' });
    expect(priceIn('LS', 'diesel', { LS: { diesel: 30 } })).toEqual({ price: 30, source: 'own' });
  });
});

describe('formatRand', () => {
  it('rounds to the nearest R10', () => {
    expect(formatRand(4846)).toBe('R4,850');
  });
});
