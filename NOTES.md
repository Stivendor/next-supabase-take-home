# Submission notes

## How to run it

```bash
pnpm install
pnpm setup:env                # supabase start + writes .env.local
pnpm exec supabase db reset   # migrations + seed (10,000 rows)
pnpm dev                      # http://localhost:3000
```

## Schema

- One table, `public.coffee_health`. `id` is the CSV ID (`bigint` PK), not generated.
- Closed-domain categories are `enum`s (`gender`, `sleep_quality`, `stress_level`, `health_issues`, `occupation`): the DB validates them on load, they take 4 bytes, and they keep their semantic order (Poor < Fair < Good < Excellent). Filter options come from the generated types (`Constants` in `lib/database.types.ts`), so the values are not duplicated in code.
- `country` is `text`: open domain. The filter's list comes from the `coffee_health_countries` view.
- Decimals are `numeric(p,1)`, matching the CSV: `bmi <= 24.5` filters exactly, with no floating-point surprises. `Smoking` and `Alcohol_Consumption` (0/1) are `boolean`. Numeric columns have range checks.
- Security: RLS with a read-only policy, plus `revoke all` and `grant select` (RLS does not cover `TRUNCATE`). The view uses `security_invoker = true`.

## Import

- `scripts/gen-coffee-seed.sh` (`pnpm db:seed:gen`) generates `supabase/seeds/coffee_health.sql`, which `db reset` loads after the migrations. Before generating, it checks the header and that every row has 16 fields and valid numbers.
- Batched INSERTs of 1,000 rows, because the Supabase CLI seed does not support `COPY ... FROM stdin`. For millions of rows I would use `COPY` straight into Postgres and create the indexes after the load.
- Verified against the CSV: 10,000 rows, with identical sums for the numeric columns and identical counts per category.

## Filtering and pagination

- Everything runs on the server: Server Component → PostgREST → Postgres. The browser only receives 50 rows per page.
- Filters live in the URL (`?country=Japan&country=Spain&age_min=20`): links can be shared, back/forward works, and there is no client state. `lib/coffee-health.ts` validates them and drops anything invalid (unknown enum values, non-finite numbers); it has tests.
- Multi-select for categories (`in`), min/max for age, coffee, sleep and BMI (`gte`/`lte`).
- Keyset pagination on `id` (`after`/`before`) instead of `OFFSET`: every page costs the same. An `OFFSET 900000` reads and discards 900,000 rows.
- The total count has its own `<Suspense>` boundary: the table renders without waiting for it.

## Scale (measured with 1M rows)

Method: the dataset copied ×100 (SQL at the end), `EXPLAIN ANALYZE` as `anon` (PostgREST's role, with RLS), and HTTP timings against PostgREST. Docker Desktop on Windows: the numbers are noisy, but the order of magnitude is reliable.

| Query | Time |
| --- | --- |
| Page 1, no filters | ~1 ms in the DB, ~30 ms over HTTP |
| Page after `id` 900,000 | ~0.1 ms in the DB, ~25 ms over HTTP |
| Page filtered by one country | < 1 ms in the DB |
| Exact count, no filters | ~50–75 ms |
| Count for one country | ~7 ms (without the index: ~40–55 ms) |
| Worst case: filter combination with no results | ~200–270 ms |

Decisions:

1. **Keyset**: pagination does not degrade with table size or page depth.
2. **Indexes only on `country` and `age`.** Finding: with RLS enabled, Postgres only uses column statistics with *leakproof* operators. `texteq` and `int2ge` are leakproof; `enum_eq` and `numeric_ge` are not. As `anon`, `bmi >= 38` is estimated at 500,000 rows (actual: 100) and `health_issues = 'Severe'` at 250,000 (actual: 1,700). I tried indexes on all 10 filterable columns: the enum and numeric ones stayed at `idx_scan = 0`, so I removed them. This also explains why `count: "estimated"` was ~30% off with ranges. Alternatives I ruled out:
   - Dropping RLS: the table is public and the grants already limit access to `SELECT`, but it goes against Supabase practice for exposed tables.
   - `real` instead of `numeric`: the statistics come back, but `bmi = 23.4` stops matching (float vs. numeric comparison), and the page was just as slow (point 3).
   - Reading with `service_role`: it bypasses RLS, but breaks least privilege for a public read.
3. **Worst case, `WHERE <rare filter> ORDER BY id LIMIT 51`**: the planner assumes matches are spread evenly and walks the PK expecting to find them early. When there are almost none, it reads the whole table (~200 ms at 1M rows, linear in size). This happens even with good statistics (tested with `real`). Safety net: the `anon` role's `statement_timeout = 3s`. If it hurts with real data: composite `(column, id)` indexes for the most used filters.
4. **Exact count**: cost grows with the number of matching rows; ~50 ms at 1M, ~10× at 10M. It does not block the table. Next step: a capped count ("10,000+") through an RPC function. I would not use the estimate with filters, because of point 2.
5. **Countries**: the view runs a `DISTINCT` over the whole table (~80–110 ms at 1M) and is cached with `"use cache"` for hours, since it only changes when the data is reloaded. At larger scale: a countries table.

## Assumptions and trade-offs

- The app only reads; the data only changes when the dataset is reloaded.
- The ×100 copies keep the CSV's distribution. Real data would have different proportions and would need measuring again.
- No column sorting: only by `id`. Sorting by another column needs a composite keyset `(column, id)` and one index per allowed sort.
- Empty inputs leave `age_min=` in the URL (the parser ignores it); removing them would need client-side JS.
- UI in English, like the dataset.
- `pnpm dev:supabase` uses `-x` to exclude the Supabase services the app does not use (storage, realtime, edge functions, logs, email). `vector` also fails on Docker Desktop for Windows.

## Reproducing with 1M rows

```sql
-- psql postgresql://postgres:postgres@127.0.0.1:54322/postgres
insert into public.coffee_health
select id + n * 10000, age, gender, country, coffee_intake, caffeine_mg, sleep_hours, sleep_quality,
       bmi, heart_rate, stress_level, physical_activity_hours, health_issues, occupation,
       smoking, alcohol_consumption
from public.coffee_health, generate_series(1, 99) n
where id <= 10000;
vacuum analyze public.coffee_health;

set role anon;  -- measure as PostgREST does, with RLS
explain analyze select * from coffee_health where country in ('Japan') order by id limit 51;
```

`pnpm exec supabase db reset` goes back to 10,000 rows.
