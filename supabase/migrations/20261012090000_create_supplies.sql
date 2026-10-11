-- Supplies along the route: butcheries, firewood, veterinary checkpoints and, later, more.
--
-- Each kind of place is a row in supply_categories, so a new kind (supermarket, ATM, tyre
-- repair, bottle store) is added with an insert here and needs no app update: the app reads
-- the names, map markers, OpenStreetMap tags and warnings from this table.

create table public.supply_categories (
  id text primary key check (id ~ '^[a-z_]+$'),
  -- "Butcher", shown on the map filter and the add screen.
  label text not null,
  -- "butchery", used in warnings: "Last butchery before…".
  noun text not null,
  -- The map marker: a symbol on a coloured circle.
  emoji text not null,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  -- OpenStreetMap tags to look for within 10 km of a route, e.g. {shop=butcher}.
  osm_tags text[] not null default '{}' check (array_to_string(osm_tags, ',') ~ '^([a-z_:]+=[a-z_:]+(,|$))*$'),
  -- Warn before any stretch longer than this without one. Null: no warning.
  gap_km integer check (gap_km > 0),
  -- Shown when a route passes one, e.g. at veterinary checkpoints. Null: no warning.
  route_warning text,
  -- The category that warning is about, so the app can name the next one after it.
  affects_category text references public.supply_categories (id),
  -- Whether travellers can add these from the map.
  user_can_add boolean not null default true,
  sort smallint not null default 0
);

alter table public.supply_categories enable row level security;

create policy "Signed-in users can read supply categories"
  on public.supply_categories for select
  to authenticated
  using (true);

grant select on public.supply_categories to authenticated;

insert into public.supply_categories
  (id, label, noun, emoji, color, osm_tags, gap_km, route_warning, affects_category, user_can_add, sort)
values
  ('butcher', 'Butcher', 'butchery', '🥩', '#B5473A', '{shop=butcher}', 150, null, null, true, 10),
  ('firewood', 'Firewood', 'firewood', '🪵', '#8A5A2B', '{shop=firewood}', 150, null, null, true, 20),
  ('vet_checkpoint', 'Veterinary checkpoint', 'veterinary checkpoint', '🐄', '#6B2410', '{}', null,
    'Fresh meat may be confiscated here. Buy meat after this checkpoint.', 'butcher', true, 30);

-- Places, shared by everyone: seeded from OpenStreetMap, or added by travellers.
create table public.supply_points (
  -- Generated on the phone, so places can be added offline.
  id uuid primary key default gen_random_uuid(),
  category text not null references public.supply_categories (id),
  name text not null check (char_length(name) between 1 and 120),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  phone text check (char_length(phone) <= 40),
  opening_hours text check (char_length(opening_hours) <= 200),
  notes text check (char_length(notes) <= 1000),
  -- A photo in the supply-photos bucket, e.g. '<user id>/<point id>.jpg'.
  photo_path text check (char_length(photo_path) <= 200),
  source text not null check (source in ('OSM', 'user')),
  -- OpenStreetMap's id for places from there, e.g. 'node/123'.
  osm_id text unique check (osm_id ~ '^(node|way|relation)/[0-9]+$'),
  last_confirmed date,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source = 'OSM') = (osm_id is not null))
);

create index supply_points_location_idx on public.supply_points (latitude, longitude);

alter table public.supply_points enable row level security;

create policy "Signed-in users can see all supply points"
  on public.supply_points for select
  to authenticated
  using (true);

create policy "Users can add their own supply points"
  on public.supply_points for insert
  to authenticated
  with check (source = 'user' and created_by = (select auth.uid()));

create policy "Users can change their own supply points"
  on public.supply_points for update
  to authenticated
  using (source = 'user' and created_by = (select auth.uid()))
  with check (source = 'user' and created_by = (select auth.uid()));

create policy "Users can delete their own supply points"
  on public.supply_points for delete
  to authenticated
  using (source = 'user' and created_by = (select auth.uid()));

grant select, insert, update, delete on public.supply_points to authenticated;

-- Adds or refreshes places the app found on OpenStreetMap along a route. Users can't write
-- OSM rows directly; this only accepts categories with OpenStreetMap tags, valid ids and
-- positions, and at most 500 places at a time.
create function public.seed_osm_supply_points(points jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(points) <> 'array' or jsonb_array_length(points) > 500 then
    raise exception 'Expected an array of at most 500 points';
  end if;

  insert into public.supply_points
    (category, name, latitude, longitude, phone, opening_hours, source, osm_id, last_confirmed, created_by)
  select
    p->>'category',
    left(p->>'name', 120),
    (p->>'latitude')::double precision,
    (p->>'longitude')::double precision,
    left(nullif(p->>'phone', ''), 40),
    left(nullif(p->>'opening_hours', ''), 200),
    'OSM',
    p->>'osm_id',
    case when p->>'last_confirmed' ~ '^\d{4}-\d{2}-\d{2}$' then (p->>'last_confirmed')::date end,
    null
  from jsonb_array_elements(points) as p
  join public.supply_categories c on c.id = p->>'category' and cardinality(c.osm_tags) > 0
  where p->>'osm_id' ~ '^(node|way|relation)/[0-9]+$'
    and coalesce(p->>'name', '') <> ''
    and (p->>'latitude')::double precision between -90 and 90
    and (p->>'longitude')::double precision between -180 and 180
  on conflict (osm_id) do update set
    category = excluded.category,
    name = excluded.name,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    phone = excluded.phone,
    opening_hours = excluded.opening_hours,
    last_confirmed = excluded.last_confirmed,
    updated_at = now();
end;
$$;

revoke execute on function public.seed_osm_supply_points(jsonb) from public, anon;
grant execute on function public.seed_osm_supply_points(jsonb) to authenticated;

-- Photos of places. Public, so they show without signing each link and can be cached for
-- offline use; each user uploads only into a folder named after their user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('supply-photos', 'supply-photos', true, 5242880, '{image/jpeg}')
on conflict (id) do nothing;

create policy "Users can upload supply photos to their own folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'supply-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "Users can replace their own supply photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'supply-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "Users can delete their own supply photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'supply-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
