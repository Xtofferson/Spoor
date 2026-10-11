-- People travelling, used to plan drinking water.
alter table public.trips add column people smallint;

alter table public.trips
  add constraint trips_people_range
  check (people is null or people between 1 and 20);
