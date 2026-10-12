/**
 * What a trip's fuel costs: the litres each stretch uses (from the vehicle's consumption on
 * each road surface), bought at the end of the stretch, at that country's price. Pure, so it
 * can be tested without a phone.
 */
import { countryAt, type CountryCode } from './countries';
import { litresBetween, type Vehicle } from './fuel';
import { priceIn, type FuelPrices, type FuelType, type PriceSource } from './fuel-prices';
import { pointAtKm, type RouteLine } from './route-points';

export type BudgetLine = {
  /** Where the fuel is bought; undefined outside the countries Spoor knows. */
  country?: CountryCode;
  litres: number;
  pricePerLitre: number;
  cost: number;
  source: PriceSource;
};

export type FuelBudget = {
  /** Rand for the whole trip. */
  total: number;
  litres: number;
  /** One line per country, in the order the route reaches them. */
  lines: BudgetLine[];
};

/**
 * The fuel budget for a route. `refills` are the stretches between fill-ups (the planned
 * fuel stops); the fuel a stretch uses is bought where it ends, refilling the tank. Without
 * fuel stops, each leg is refilled at the stop it ends at.
 */
export function fuelBudget(
  line: RouteLine,
  refills: { startKm: number; endKm: number }[],
  vehicle: Vehicle,
  fuel: FuelType,
  ownPrices: FuelPrices,
  countryOf: (point: [number, number]) => CountryCode | undefined = countryAt
): FuelBudget {
  const stretches = refills.length > 0 ? refills : line.legs;
  const lines: BudgetLine[] = [];
  for (const stretch of stretches) {
    const litres = litresBetween(line, stretch.startKm, stretch.endKm, vehicle.consumption);
    if (litres <= 0) continue;
    const country = countryOf(pointAtKm(line, stretch.endKm));
    let entry = lines.find((l) => l.country === country);
    if (!entry) {
      const { price, source } = priceIn(country, fuel, ownPrices);
      entry = { country, litres: 0, pricePerLitre: price, cost: 0, source };
      lines.push(entry);
    }
    entry.litres += litres;
    entry.cost = entry.litres * entry.pricePerLitre;
  }
  return {
    total: lines.reduce((sum, l) => sum + l.cost, 0),
    litres: lines.reduce((sum, l) => sum + l.litres, 0),
    lines,
  };
}

/** "R4,850": rounded to R10, as fuel prices change too often for anything finer. */
export function formatRand(amount: number): string {
  return `R${(Math.round(amount / 10) * 10).toLocaleString('en-US')}`;
}
