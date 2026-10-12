-- OpenStreetMap is now fetched by the "supplies" Edge Function, for 0.25° tiles, and shared
-- with everyone through these tables. Phones read them instead of calling Overpass.

-- Each place's tile, e.g. '-92:108', so the app can ask for exactly the tiles along a route.
-- Must match tileId() in supabase/functions/supplies/osm.ts.
alter table public.supply_points
  add column tile text generated always as
    ((floor(latitude / 0.25))::integer::text || ':' || (floor(longitude / 0.25))::integer::text) stored,
  -- Extra facts from OpenStreetMap, e.g. a fuel station's brand or what kind of water point it is.
  add column details jsonb,
  -- When the Edge Function last saw this place on OpenStreetMap; ones not seen when their
  -- tile is looked up again have gone from OpenStreetMap and are removed.
  add column osm_seen_at timestamptz;

create index supply_points_tile_idx on public.supply_points (tile);

-- Fuel and water join the other categories, so they're stored, shared and (later) rated the
-- same way. Travellers can add them too, e.g. a farm selling diesel or a borehole.
insert into public.supply_categories
  (id, label, noun, emoji, color, osm_tags, gap_km, route_warning, affects_category, user_can_add, sort)
values
  ('fuel', 'Fuel', 'fuel station', '⛽', '#D9902F', '{amenity=fuel}', null, null, null, true, 0),
  ('water', 'Water', 'water point', '💧', '#3E7CA6',
    '{amenity=drinking_water,amenity=water_point,man_made=water_tap,man_made=water_well}', null, null, null, true, 1)
on conflict (id) do nothing;

-- Towns and villages, used to name fuel, water and supply stops after the nearest one.
create table public.settlements (
  osm_id text primary key check (osm_id ~ '^(node|way|relation)/[0-9]+$'),
  name text not null,
  kind text not null,
  latitude double precision not null,
  longitude double precision not null,
  tile text generated always as
    ((floor(latitude / 0.25))::integer::text || ':' || (floor(longitude / 0.25))::integer::text) stored
);

create index settlements_tile_idx on public.settlements (tile);

alter table public.settlements enable row level security;

create policy "Signed-in users can read settlements"
  on public.settlements for select
  to authenticated
  using (true);

grant select on public.settlements to authenticated;

-- When each tile was last fetched from OpenStreetMap. Only the Edge Function uses it.
create table public.osm_tiles (
  id text primary key check (id ~ '^-?\d{1,3}:-?\d{1,4}$'),
  fetched_at timestamptz not null default now()
);

alter table public.osm_tiles enable row level security;

-- Phones no longer share what they find on OpenStreetMap; the Edge Function does it.
drop function if exists public.seed_osm_supply_points(jsonb);
