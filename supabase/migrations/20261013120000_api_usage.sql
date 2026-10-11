-- How often each user calls a paid or rate-limited service each day (e.g. OpenRouteService
-- through the "ors" Edge Function), so one account can't use up the app's whole daily quota.
create table public.api_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  service text not null check (char_length(service) <= 40),
  count integer not null default 0,
  primary key (user_id, day, service)
);

-- No policies: users can't read or change it; only the function below writes to it.
alter table public.api_usage enable row level security;

-- Counts one call by the signed-in user and says whether they're still within `p_limit`
-- for today. Called by Edge Functions on the user's behalf.
create function public.use_api_quota(p_service text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
begin
  if auth.uid() is null then
    return false;
  end if;
  insert into public.api_usage (user_id, day, service, count)
  values (auth.uid(), current_date, p_service, 1)
  on conflict (user_id, day, service) do update set count = public.api_usage.count + 1
  returning count into used;
  return used <= p_limit;
end;
$$;

revoke execute on function public.use_api_quota(text, integer) from public, anon;
grant execute on function public.use_api_quota(text, integer) to authenticated;
