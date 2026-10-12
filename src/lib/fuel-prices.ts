import { useSyncExternalStore } from 'react';

import type { CountryCode } from '@/lib/countries';
import type { FuelType } from '@/lib/fuel';
import { storage } from '@/lib/storage';

export type { FuelType };

/** Rand per litre, for diesel and petrol. Either can be missing when it isn't known. */
export type FuelPrice = Partial<Record<FuelType, number>>;
export type FuelPrices = Partial<Record<CountryCode, FuelPrice>>;

/**
 * Pump prices in Rand per litre, from published prices in early October 2026, converted at
 * that week's exchange rates (P1 = R1.20, K1 = R0.85, US$1 = R16.51) and, for Mozambique,
 * the metical's long-steady US$1 = MT63.9. Inland
 * prices where they differ (South Africa: 95 petrol, 50 ppm diesel). Countries without a
 * reliable figure are left out; they're priced like South Africa until someone enters one.
 */
export const ESTIMATED_PRICES: FuelPrices = {
  ZA: { petrol: 30.25, diesel: 33.29 },
  NA: { petrol: 26.58, diesel: 27.86 },
  BW: { petrol: 21.89, diesel: 25.16 },
  ZM: { petrol: 26.87, diesel: 28.42 },
  ZW: { petrol: 34.01 },
  MZ: { petrol: 24.22, diesel: 29.97 },
  TZ: { petrol: 25.26, diesel: 25.43 },
};

/** When the estimates are from, as `YYYY-MM-DD`. */
export const ESTIMATES_DATE = '2026-10-07';

/** The country used when a country has no price. */
export const FALLBACK_COUNTRY: CountryCode = 'ZA';

/** Prices the person entered themselves, which replace the estimates. Saved on the phone. */
const KEY = 'spoor.fuelPrices.v1';

let own: FuelPrices | undefined;
const listeners = new Set<() => void>();

function getOwn(): FuelPrices {
  if (!own) {
    try {
      own = JSON.parse(storage.getItem(KEY) ?? '{}') ?? {};
    } catch {
      own = {};
    }
  }
  return own!;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The prices entered on this phone (not the estimates). */
export function useOwnFuelPrices(): FuelPrices {
  return useSyncExternalStore(subscribe, getOwn, getOwn);
}

/** Sets (or, with undefined, clears) the price someone pays in a country. */
export function setOwnFuelPrice(country: CountryCode, fuel: FuelType, price: number | undefined) {
  const current = getOwn();
  const next: FuelPrice = { ...current[country] };
  if (price === undefined) delete next[fuel];
  else next[fuel] = price;
  own = { ...current, [country]: next };
  storage.setItem(KEY, JSON.stringify(own));
  listeners.forEach((listener) => listener());
}

export type PriceSource = 'own' | 'estimate' | 'fallback';

/**
 * The price per litre in a country: the person's own price, else the estimate, else South
 * Africa's (own or estimate). `source` says which, so the budget can say when it guessed.
 */
export function priceIn(
  country: CountryCode | undefined,
  fuel: FuelType,
  ownPrices: FuelPrices
): { price: number; source: PriceSource } {
  const ownPrice = country && ownPrices[country]?.[fuel];
  if (ownPrice) return { price: ownPrice, source: 'own' };
  const estimate = country && ESTIMATED_PRICES[country]?.[fuel];
  if (estimate) return { price: estimate, source: 'estimate' };
  const fallback = ownPrices[FALLBACK_COUNTRY]?.[fuel] ?? ESTIMATED_PRICES[FALLBACK_COUNTRY]![fuel]!;
  return { price: fallback, source: 'fallback' };
}
