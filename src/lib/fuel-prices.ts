import { useSyncExternalStore } from 'react';

import type { CountryCode } from '@/lib/countries';
import type { FuelType } from '@/lib/fuel';
import { storage } from '@/lib/storage';

export type { FuelType };

/** Rand per litre, for diesel and petrol. Either can be missing when it isn't known. */
export type FuelPrice = Partial<Record<FuelType, number>>;
export type FuelPrices = Partial<Record<CountryCode, FuelPrice>>;

/** A published price and when it's from (`YYYY-MM-DD`). */
export type ListedPrice = { price: number; asOf: string };
/** The shared price list, kept in Supabase's fuel_prices table. */
export type PriceList = Partial<Record<CountryCode, Partial<Record<FuelType, ListedPrice>>>>;

/**
 * The prices built into the app, used until the list has been read from Supabase (and if it
 * never can be). The same as the first rows of the fuel_prices table: published prices from
 * early October 2026 in Rand. Countries without a reliable figure are left out; they're
 * priced like South Africa until one is added.
 */
export const BUILT_IN_PRICES: PriceList = {
  ZA: { petrol: { price: 30.25, asOf: '2026-10-07' }, diesel: { price: 33.29, asOf: '2026-10-07' } },
  NA: { petrol: { price: 26.58, asOf: '2026-10-07' }, diesel: { price: 27.86, asOf: '2026-10-07' } },
  BW: { petrol: { price: 21.89, asOf: '2026-10-05' }, diesel: { price: 25.16, asOf: '2026-10-05' } },
  ZM: { petrol: { price: 26.87, asOf: '2026-10-01' }, diesel: { price: 28.42, asOf: '2026-10-01' } },
  ZW: { petrol: { price: 34.01, asOf: '2026-10-05' } },
  MZ: { petrol: { price: 24.22, asOf: '2026-10-01' }, diesel: { price: 29.97, asOf: '2026-10-01' } },
  TZ: { petrol: { price: 25.26, asOf: '2026-10-07' }, diesel: { price: 25.43, asOf: '2026-10-07' } },
};

/** The country used when a country has no price. */
export const FALLBACK_COUNTRY: CountryCode = 'ZA';

// -- The shared list, as last read from Supabase -----------------------------------

const LIST_KEY = 'spoor.fuelPriceList.v1';

type SavedList = { prices: PriceList; fetchedAt: number };

let saved: SavedList | null | undefined;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSaved(): SavedList | null {
  if (saved === undefined) {
    try {
      const parsed = JSON.parse(storage.getItem(LIST_KEY) ?? 'null');
      saved = parsed && typeof parsed.fetchedAt === 'number' && parsed.prices ? parsed : null;
    } catch {
      saved = null;
    }
  }
  return saved ?? null;
}

const getList = () => getSaved()?.prices ?? BUILT_IN_PRICES;

/** The shared price list: as last read from Supabase, or the built-in one. */
export function usePriceList(): PriceList {
  return useSyncExternalStore(subscribe, getList, getList);
}

/** When the list was last read from Supabase, or undefined if it never was on this phone. */
export function priceListFetchedAt(): number | undefined {
  return getSaved()?.fetchedAt;
}

/** Saves the list read from Supabase, for every screen and for offline. */
export function savePriceList(prices: PriceList, fetchedAt = Date.now()) {
  saved = { prices, fetchedAt };
  storage.setItem(LIST_KEY, JSON.stringify(saved));
  emit();
}

/** Turns fuel_prices rows into a price list, skipping countries and fuels the app doesn't know. */
export function priceListFromRows(
  rows: { country: string; fuel: string; price_rand: number | string; as_of: string }[],
  known: readonly string[]
): PriceList {
  const list: PriceList = {};
  for (const row of rows) {
    const price = Number(row.price_rand);
    if (!known.includes(row.country) || (row.fuel !== 'diesel' && row.fuel !== 'petrol')) continue;
    if (!Number.isFinite(price) || price <= 0) continue;
    const country = row.country as CountryCode;
    list[country] = { ...list[country], [row.fuel]: { price, asOf: row.as_of } };
  }
  return list;
}

// -- Prices someone entered on this phone ---------------------------------------------

/** Prices the person entered themselves, which replace the list's. Saved on the phone. */
const OWN_KEY = 'spoor.fuelPrices.v1';

let own: FuelPrices | undefined;

function getOwn(): FuelPrices {
  if (!own) {
    try {
      own = JSON.parse(storage.getItem(OWN_KEY) ?? '{}') ?? {};
    } catch {
      own = {};
    }
  }
  return own!;
}

/** The prices entered on this phone (not the list's). */
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
  storage.setItem(OWN_KEY, JSON.stringify(own));
  emit();
}

// -- Choosing a price -------------------------------------------------------------------

export type PriceSource = 'own' | 'estimate' | 'fallback';

/**
 * The price per litre in a country: the person's own price, else the list's, else South
 * Africa's (own or listed). `source` says which, and `asOf` when a listed price is from, so
 * the budget can say when it guessed and how current it is.
 */
export function priceIn(
  country: CountryCode | undefined,
  fuel: FuelType,
  ownPrices: FuelPrices,
  list: PriceList = BUILT_IN_PRICES
): { price: number; source: PriceSource; asOf?: string } {
  const ownPrice = country && ownPrices[country]?.[fuel];
  if (ownPrice) return { price: ownPrice, source: 'own' };
  const listed = country && list[country]?.[fuel];
  if (listed) return { price: listed.price, source: 'estimate', asOf: listed.asOf };
  const ownFallback = ownPrices[FALLBACK_COUNTRY]?.[fuel];
  if (ownFallback) return { price: ownFallback, source: 'fallback' };
  const fallback = list[FALLBACK_COUNTRY]?.[fuel] ?? BUILT_IN_PRICES[FALLBACK_COUNTRY]![fuel]!;
  return { price: fallback.price, source: 'fallback', asOf: fallback.asOf };
}
