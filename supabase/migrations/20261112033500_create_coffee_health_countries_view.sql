-- Options for the country filter. country is text (open domain), so the list comes
-- from the data; the app caches it because it only changes when the dataset is reloaded.
-- security_invoker: the view applies coffee_health's RLS (by default it would bypass it).
create view public.coffee_health_countries
  with (security_invoker = true)
  as
  select distinct country
  from public.coffee_health
  order by country;

revoke all on table public.coffee_health_countries from anon, authenticated;
grant select on table public.coffee_health_countries to anon, authenticated;
