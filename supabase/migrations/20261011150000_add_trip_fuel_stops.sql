-- Towns chosen to fill up at, each with its fuel stations' OpenStreetMap ids:
-- [{ "name": "Palapye", "stationIds": ["node/123", ...] }].
alter table public.trips add column fuel_stops jsonb;
