-- Every day at 06:00 South African time (04:00 UTC), ask the fuel-prices-update Edge Function
-- to fetch South Africa's latest pump prices into fuel_prices. Prices change on the first
-- Wednesday of each month, so most days nothing changes.
--
-- Before running this, store two secrets in Vault (in the SQL Editor, not in this file):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<a secret API key, sb_secret_...>', 'fuel_prices_cron_key');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'update-sa-fuel-prices',
  '0 4 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/fuel-prices-update',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'fuel_prices_cron_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
