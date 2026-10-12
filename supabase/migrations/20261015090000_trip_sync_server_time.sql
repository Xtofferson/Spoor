-- Trip sync with the server's clock instead of each phone's.
--
-- Supabase now sets updated_at itself, deleted trips leave a record so an old copy on
-- another phone can't bring them back, and phones save through save_trips, which only
-- saves a phone's version if nobody changed the trip since that phone last downloaded it.

-- The server sets updated_at on every insert and update; whatever a phone sends is ignored.
create function public.trips_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trips_set_updated_at
  before insert or update on public.trips
  for each row execute function public.trips_set_updated_at();

-- So phones can download only the trips changed since they last synced.
create index trips_user_updated_idx on public.trips (user_id, updated_at);

-- A record of each deleted trip, so other phones remove their copy and can't upload it again.
create table public.deleted_trips (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  deleted_at timestamptz not null default now()
);

create index deleted_trips_user_idx on public.deleted_trips (user_id, deleted_at);

alter table public.deleted_trips enable row level security;

create policy "Users can see their own deleted trips"
  on public.deleted_trips for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.deleted_trips to authenticated;

create function public.trips_record_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.deleted_trips (id, user_id)
  values (old.id, old.user_id)
  on conflict (id) do update set deleted_at = now();
  return old;
end;
$$;

create trigger trips_record_deletion
  after delete on public.trips
  for each row execute function public.trips_record_deletion();

-- Saves trips from a phone. Each item is { "trip": {...}, "base": "<updated_at the phone
-- last downloaded, or null for a new trip>" }. For each trip it returns its id and:
--   saved     with the new updated_at,
--   conflict  when the trip changed on the server since that phone downloaded it,
--   deleted   when the trip has been deleted.
-- Runs as the user, so row-level security still decides what they may save.
create function public.save_trips(p_trips jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
  trip jsonb;
  base timestamptz;
  current_updated timestamptz;
  saved_updated timestamptz;
  results jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_trips) <> 'array' or jsonb_array_length(p_trips) > 200 then
    raise exception 'Expected an array of at most 200 trips';
  end if;

  for item in select * from jsonb_array_elements(p_trips) loop
    trip := item->'trip';
    base := nullif(item->>'base', '')::timestamptz;

    if exists (select 1 from public.deleted_trips d where d.id = trip->>'id' and d.user_id = auth.uid()) then
      results := results || jsonb_build_object('id', trip->>'id', 'status', 'deleted');
      continue;
    end if;

    select t.updated_at into current_updated from public.trips t where t.id = trip->>'id';

    if found and (base is null or current_updated > base) then
      results := results || jsonb_build_object('id', trip->>'id', 'status', 'conflict');
    elsif found then
      update public.trips set
        name = trip->>'name',
        start_date = (trip->>'start_date')::date,
        end_date = nullif(trip->>'end_date', '')::date,
        people = nullif(trip->>'people', '')::smallint,
        fuel_stops = nullif(trip->'fuel_stops', 'null'::jsonb),
        stops = coalesce(trip->'stops', '[]'::jsonb)
      where id = trip->>'id'
      returning updated_at into saved_updated;
      results := results || jsonb_build_object('id', trip->>'id', 'status', 'saved', 'updated_at', saved_updated);
    else
      insert into public.trips (id, user_id, name, start_date, end_date, people, fuel_stops, stops, created_at)
      values (
        trip->>'id',
        auth.uid(),
        trip->>'name',
        (trip->>'start_date')::date,
        nullif(trip->>'end_date', '')::date,
        nullif(trip->>'people', '')::smallint,
        nullif(trip->'fuel_stops', 'null'::jsonb),
        coalesce(trip->'stops', '[]'::jsonb),
        coalesce(nullif(trip->>'created_at', '')::timestamptz, now())
      )
      returning updated_at into saved_updated;
      results := results || jsonb_build_object('id', trip->>'id', 'status', 'saved', 'updated_at', saved_updated);
    end if;
  end loop;

  return results;
end;
$$;

revoke execute on function public.save_trips(jsonb) from public, anon;
grant execute on function public.save_trips(jsonb) to authenticated;
