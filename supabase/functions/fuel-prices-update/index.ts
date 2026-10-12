// Keeps South Africa's fuel prices in the fuel_prices table current. A daily pg_cron job calls
// it (see the 20261017090000_fuel_price_updates migration); South Africa sets new pump prices
// on the first Wednesday of each month, so most days nothing changes.
//
// Prices come from OilPriceAPI (the secret OILPRICEAPI_KEY), which follows the Department of
// Mineral Resources and Energy. Only calls carrying one of the project's secret keys run it.
import { withSupabase } from 'npm:@supabase/server@1';

const API_URL = 'https://api.oilpriceapi.com/v1/prices/latest';

/** What to fetch for each row of fuel_prices. */
const PRICES = [
  { country: 'ZA', fuel: 'petrol', code: 'GASOLINE_95_RETAIL_ZA_ZAR', source: 'OilPriceAPI (DMRE), 95' },
  { country: 'ZA', fuel: 'diesel', code: 'DIESEL_50PPM_RETAIL_ZA_ZAR', source: 'OilPriceAPI (DMRE), 50 ppm' },
] as const;

/** Anything outside this many Rand per litre is taken as a mistake, not a price. */
const MIN_RAND = 10;
const MAX_RAND = 80;

type Result = { code: string; status: 'updated' | 'unchanged' | 'skipped'; price?: number; asOf?: string; reason?: string };

function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export default {
  fetch: withSupabase({ auth: 'secret:*' }, async (_req, ctx) => {
    const key = Deno.env.get('OILPRICEAPI_KEY');
    if (!key) return error(500, 'missing-key', 'OILPRICEAPI_KEY isn’t set for this function.');

    const results: Result[] = [];
    for (const row of PRICES) {
      try {
        const response = await fetch(`${API_URL}?by_code=${row.code}`, {
          headers: { Authorization: `Token ${key}`, Accept: 'application/json' },
        });
        const body = await response.json().catch(() => null);
        const data = body?.data;
        if (!response.ok || body?.status !== 'success' || !data) {
          results.push({ code: row.code, status: 'skipped', reason: `OilPriceAPI answered ${response.status}` });
          continue;
        }
        const price = Math.round(Number(data.price) * 100) / 100;
        const asOf = String(data.as_of ?? data.created_at ?? '').slice(0, 10);
        if (data.currency !== 'ZAR' || !(price >= MIN_RAND && price <= MAX_RAND) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
          results.push({ code: row.code, status: 'skipped', price, asOf, reason: 'Not a believable Rand price' });
          continue;
        }

        const { data: current } = await ctx.supabaseAdmin
          .from('fuel_prices')
          .select('price_rand, as_of')
          .eq('country', row.country)
          .eq('fuel', row.fuel)
          .maybeSingle();
        // Never replace a newer price (e.g. one typed in by hand) with an older one.
        if (current && (current.as_of > asOf || (Number(current.price_rand) === price && current.as_of === asOf))) {
          results.push({ code: row.code, status: 'unchanged', price, asOf });
          continue;
        }

        const { error: saveError } = await ctx.supabaseAdmin
          .from('fuel_prices')
          .upsert({ country: row.country, fuel: row.fuel, price_rand: price, as_of: asOf, source: row.source });
        if (saveError) throw saveError;
        results.push({ code: row.code, status: 'updated', price, asOf });
      } catch (caught) {
        results.push({ code: row.code, status: 'skipped', reason: caught instanceof Error ? caught.message : String(caught) });
      }
    }

    const failed = results.every((result) => result.status === 'skipped');
    return Response.json({ results }, { status: failed ? 502 : 200 });
  }),
};
