-- Trips synced from the Spoor app. Each row belongs to one user, and row-level
-- security makes sure people can only read and change their own trips.
create table public.trips (
  -- Generated on the phone so trips can be created offline.
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  start_date date not null,
  -- Ordered stops: the first is the start and the last is the end.
  stops jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  -- Set by the app when a trip is edited; the newest edit wins when syncing.
  updated_at timestamptz not null default now()
);

create index trips_user_id_idx on public.trips (user_id);

alter table public.trips enable row level security;

create policy "Users can view their own trips"
  on public.trips for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own trips"
  on public.trips for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own trips"
  on public.trips for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own trips"
  on public.trips for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Let signed-in users reach the table through the API; the policies above still apply.
grant select, insert, update, delete on public.trips to authenticated;
