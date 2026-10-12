import { useEffect } from 'react';
import { AppState } from 'react-native';

import { COUNTRIES } from '@/lib/countries';
import { priceListFetchedAt, priceListFromRows, savePriceList } from '@/lib/fuel-prices';
import { shareRequest } from '@/lib/in-flight';
import { supabase } from '@/lib/supabase';

/** The list changes about once a month, so it's read again at most every few hours. */
const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * Reads the shared fuel price list from Supabase and keeps it on the phone. Quietly keeps the
 * last list (or the built-in one) when offline or when something goes wrong.
 */
export function refreshFuelPrices(force = false): Promise<void> {
  const fetchedAt = priceListFetchedAt();
  if (!force && fetchedAt !== undefined && Date.now() - fetchedAt < REFRESH_AFTER_MS) return Promise.resolve();
  return shareRequest('fuel-prices', async () => {
    const { data, error } = await supabase.from('fuel_prices').select('country, fuel, price_rand, as_of');
    if (error) throw error;
    // An empty answer (e.g. the table not set up yet) keeps the prices already on the phone.
    if (data && data.length > 0) savePriceList(priceListFromRows(data, COUNTRIES));
  }).catch((error: unknown) => console.warn('Fuel prices not updated:', error));
}

/** Keeps the price list current while the app is open: on launch and back in the foreground. */
export function useFuelPriceSync() {
  useEffect(() => {
    void refreshFuelPrices();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshFuelPrices();
    });
    return () => subscription.remove();
  }, []);
}
