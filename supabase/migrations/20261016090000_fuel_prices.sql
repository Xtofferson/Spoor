-- Fuel prices per country, in Rand per litre, for each trip's fuel budget. Everyone reads
-- the same list, so a price changed here reaches every phone without a new app version.
-- Only the project's owner changes it (dashboard, SQL, or later a scheduled Edge Function).

create table public.fuel_prices (
  -- ISO 3166 code, e.g. 'ZA'. Must be one of COUNTRIES in src/lib/countries.ts to be used.
  country text not null check (country ~ '^[A-Z]{2}$'),
  fuel text not null check (fuel in ('diesel', 'petrol')),
  price_rand numeric(6, 2) not null check (price_rand > 0 and price_rand < 500),
  -- When the price was published, shown in the app as "Prices from 7 Oct 2026".
  as_of date not null,
  -- Where it came from, for whoever updates it next.
  source text,
  updated_at timestamptz not null default now(),
  primary key (country, fuel)
);

create function public.fuel_prices_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger fuel_prices_set_updated_at
  before update on public.fuel_prices
  for each row execute function public.fuel_prices_set_updated_at();

alter table public.fuel_prices enable row level security;

create policy "Anyone can read fuel prices"
  on public.fuel_prices for select
  to anon, authenticated
  using (true);

grant select on public.fuel_prices to anon, authenticated;

-- Published prices from early October 2026, converted to Rand at that week's rates
-- (P1 = R1.20, K1 = R0.85, US$1 = R16.51, US$1 = MT63.9). The same as the app's built-in list.
insert into public.fuel_prices (country, fuel, price_rand, as_of, source) values
  ('ZA', 'petrol', 30.25, '2026-10-07', 'DMRE, inland 95'),
  ('ZA', 'diesel', 33.29, '2026-10-07', 'DMRE, inland 50 ppm wholesale'),
  ('NA', 'petrol', 26.58, '2026-10-07', 'Ministry of Mines and Energy, Walvis Bay 95'),
  ('NA', 'diesel', 27.86, '2026-10-07', 'Ministry of Mines and Energy, Walvis Bay 50 ppm'),
  ('BW', 'petrol', 21.89, '2026-10-05', 'P18.21, GlobalPetrolPrices'),
  ('BW', 'diesel', 25.16, '2026-10-05', 'P20.93, GlobalPetrolPrices'),
  ('ZM', 'petrol', 26.87, '2026-10-01', 'ERB, K31.46'),
  ('ZM', 'diesel', 28.42, '2026-10-01', 'ERB, K33.27'),
  ('ZW', 'petrol', 34.01, '2026-10-05', 'US$2.06, GlobalPetrolPrices'),
  ('MZ', 'petrol', 24.22, '2026-10-01', 'MT93.75'),
  ('MZ', 'diesel', 29.97, '2026-10-01', 'MT116'),
  ('TZ', 'petrol', 25.26, '2026-10-07', 'EWURA Dar es Salaam cap, US$1.53'),
  ('TZ', 'diesel', 25.43, '2026-10-07', 'EWURA Dar es Salaam cap, US$1.54');
