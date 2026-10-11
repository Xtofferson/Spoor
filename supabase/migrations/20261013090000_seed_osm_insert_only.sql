-- Places from OpenStreetMap can be added by the app, but no longer changed: before, any
-- signed-in user could call this function with an existing OpenStreetMap id and rename or
-- move that place for everyone. Existing places now stay as they are; refreshing them from
-- OpenStreetMap will be done server-side later.
create or replace function public.seed_osm_supply_points(points jsonb)
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
  on conflict (osm_id) do nothing;
end;
$$;

-- Unchanged by "create or replace", but stated again so this file stands on its own.
revoke execute on function public.seed_osm_supply_points(jsonb) from public, anon;
grant execute on function public.seed_osm_supply_points(jsonb) to authenticated;
