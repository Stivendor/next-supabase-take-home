-- Synthetic coffee consumption and health dataset (data/synthetic_coffee_health_10000.csv).
-- The data is loaded by supabase/seeds/coffee_health.sql (pnpm db:seed:gen).

-- Enums: closed domain validated by the DB on load, 4 bytes per value and,
-- for the ordinal scales, semantic order (Poor < Fair < Good < Excellent).
create type public.gender as enum ('Male', 'Female', 'Other');
create type public.sleep_quality as enum ('Poor', 'Fair', 'Good', 'Excellent');
create type public.stress_level as enum ('Low', 'Medium', 'High');
create type public.health_issues as enum ('None', 'Mild', 'Moderate', 'Severe');
create type public.occupation as enum ('Office', 'Healthcare', 'Service', 'Student', 'Other');

create table public.coffee_health (
  -- CSV ID: the source identifier, not generated.
  id bigint primary key,
  age smallint not null check (age >= 0),
  gender public.gender not null,
  -- text rather than enum: the list of countries can grow.
  country text not null,
  -- numeric with 1 decimal (like the CSV): exact filters, no floating-point errors.
  coffee_intake numeric(4, 1) not null check (coffee_intake >= 0),
  caffeine_mg numeric(6, 1) not null check (caffeine_mg >= 0),
  sleep_hours numeric(3, 1) not null check (sleep_hours between 0 and 24),
  sleep_quality public.sleep_quality not null,
  bmi numeric(4, 1) not null check (bmi > 0),
  heart_rate smallint not null check (heart_rate > 0),
  stress_level public.stress_level not null,
  physical_activity_hours numeric(4, 1) not null check (physical_activity_hours >= 0),
  health_issues public.health_issues not null,
  occupation public.occupation not null,
  smoking boolean not null,
  alcohol_consumption boolean not null
);

alter table public.coffee_health enable row level security;

create policy "Allow public read access"
  on public.coffee_health
  for select
  to anon, authenticated
  using (true);

-- Read-only through the Data API. RLS does not cover TRUNCATE, so every default
-- privilege is revoked and only SELECT is granted.
revoke all on table public.coffee_health from anon, authenticated;
grant select on table public.coffee_health to anon, authenticated;
