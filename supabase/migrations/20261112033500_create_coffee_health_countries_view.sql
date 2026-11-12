-- Opciones del filtro de país. country es text (dominio abierto), así que la lista
-- sale de los datos; la app la cachea porque cambia solo al recargar el dataset.
-- security_invoker: la vista aplica el RLS de coffee_health (por defecto lo saltaría).
create view public.coffee_health_countries
  with (security_invoker = true)
  as
  select distinct country
  from public.coffee_health
  order by country;

revoke all on table public.coffee_health_countries from anon, authenticated;
grant select on table public.coffee_health_countries to anon, authenticated;
