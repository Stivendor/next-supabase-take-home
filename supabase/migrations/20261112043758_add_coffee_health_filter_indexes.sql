-- Indexes for the table filters, chosen by measuring with EXPLAIN ANALYZE over 1M rows.
--
-- Only country and age: with RLS enabled (the anon role, PostgREST's) the planner uses
-- statistics only with leakproof operators. texteq and int2ge are; enum_eq and numeric_ge are
-- not, so for enum and numeric columns the planner estimates with default selectivity and never
-- picks their indexes (tested: indexes on those columns stayed at idx_scan = 0).
--
-- Measured at 1M rows: count per country ~45 ms -> ~7 ms (index-only scan); rare age + country
-- ~43 ms -> ~6 ms (BitmapAnd). Pagination without filters or with common filters already uses the PK.
--
-- ponytail: a plain CREATE INDEX blocks writes while it builds. With a large production table,
-- create them with CONCURRENTLY outside a transaction.
create index coffee_health_country_idx on public.coffee_health (country);
create index coffee_health_age_idx on public.coffee_health (age);
