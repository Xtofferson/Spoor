-- Last day of the trip. Trips saved before this column existed have no end date.
alter table public.trips add column end_date date;

alter table public.trips
  add constraint trips_end_date_not_before_start
  check (end_date is null or end_date >= start_date);
