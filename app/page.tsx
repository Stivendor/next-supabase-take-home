import { cacheLife } from "next/cache";
import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ENUM_FILTER_KEYS,
  PAGE_SIZE,
  RANGE_FILTER_KEYS,
  parseSearchParams,
  toHref,
  toSearchParams,
  type CoffeeHealthRow,
  type Cursor,
  type Filters,
  type SearchParams,
} from "@/lib/coffee-health";
import { createPublicClient } from "@/lib/supabase/server";

import { CoffeeFilters } from "./coffee-filters";

export default function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Coffee &amp; health</h1>
          <p className="text-sm text-muted-foreground">
            Synthetic dataset of coffee consumption and health indicators.
          </p>
        </header>
        {/* searchParams es dato de request: con cacheComponents debe leerse dentro de Suspense. */}
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <CoffeeHealth searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function CoffeeHealth({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { filters, cursor } = parseSearchParams(await searchParams);
  // El conteo no se espera aquí: llega por streaming en su propio Suspense y no frena la tabla.
  const count = getCount(filters);
  const [countries, page] = await Promise.all([getCountries(), getPage(filters, cursor)]);

  return (
    <>
      {/* key: remonta el formulario al cambiar filtros para resetear inputs no controlados. */}
      <CoffeeFilters key={toSearchParams(filters).toString()} filters={filters} countries={countries} />
      <div className="flex items-center justify-between gap-4">
        {/* La región aria-live queda fuera del Suspense: persiste y se anuncia cada cambio del total. */}
        <div aria-live="polite">
          <Suspense fallback={<p className="text-sm text-muted-foreground">Counting…</p>}>
            <ResultCount count={count} />
          </Suspense>
        </div>
        <Pagination filters={filters} rows={page.rows} hasPrev={page.hasPrev} hasNext={page.hasNext} />
      </div>
      <CoffeeTable rows={page.rows} />
    </>
  );
}

async function getCountries() {
  "use cache";
  // Cambia solo al recargar el dataset: evita un DISTINCT sobre toda la tabla por request.
  cacheLife("hours");
  const { data, error } = await createPublicClient().from("coffee_health_countries").select("country");
  if (error) throw new Error(`coffee_health_countries: ${error.message}`);
  return data.flatMap((row) => (row.country ? [row.country] : []));
}

/** Misma consulta filtrada para filas y conteo (head = solo conteo, sin traer filas). */
function filteredQuery(filters: Filters, head: boolean) {
  let query = createPublicClient()
    .from("coffee_health")
    .select("*", head ? { count: "exact", head: true } : undefined);
  if (filters.country.length) query = query.in("country", filters.country);
  for (const key of ENUM_FILTER_KEYS) {
    if (filters[key].length) query = query.in(key, filters[key]);
  }
  for (const key of RANGE_FILTER_KEYS) {
    const { min, max } = filters[key];
    if (min !== undefined) query = query.gte(key, min);
    if (max !== undefined) query = query.lte(key, max);
  }
  return query;
}

async function getPage(filters: Filters, cursor: Cursor) {
  // Keyset sobre id: costo constante en cualquier página, a diferencia de OFFSET.
  // Se pide una fila extra para saber si hay más.
  const backward = cursor !== null && "before" in cursor;
  let query = filteredQuery(filters, false);
  if (cursor && "after" in cursor) query = query.gt("id", cursor.after);
  if (cursor && "before" in cursor) query = query.lt("id", cursor.before);

  const { data, error } = await query.order("id", { ascending: !backward }).limit(PAGE_SIZE + 1);
  if (error) throw new Error(`coffee_health: ${error.message}`);

  const hasMore = data.length > PAGE_SIZE;
  const rows = data.slice(0, PAGE_SIZE);
  if (backward) rows.reverse();

  return {
    rows,
    hasPrev: backward ? hasMore : cursor !== null,
    hasNext: backward ? true : hasMore,
  };
}

// Exacto: "estimated" de PostgREST erraba ~30% con rangos. Con RLS, el planner no usa
// estadísticas en operadores no leakproof (numeric, enum) y estima a ciegas. Sin cursor, para
// que el total no cambie al paginar.
// ponytail: seq scan paralelo, ~50 ms a 1M filas sin filtros y lineal con el tamaño. Si a ~10M
// pesa, contar con tope vía RPC (count sobre un subquery con limit) y mostrar "10,000+".
async function getCount(filters: Filters) {
  const { count, error } = await filteredQuery(filters, true);
  if (error) throw new Error(`coffee_health count: ${error.message}`);
  return count ?? 0;
}

async function ResultCount({ count }: { count: Promise<number> }) {
  const n = await count;
  return (
    <p className="text-sm text-muted-foreground">
      {n.toLocaleString("en-US")} {n === 1 ? "result" : "results"}
    </p>
  );
}

function Pagination({
  filters,
  rows,
  hasPrev,
  hasNext,
}: {
  filters: Filters;
  rows: CoffeeHealthRow[];
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const first = rows[0];
  const last = rows.at(-1);
  return (
    <nav aria-label="Pagination" className="flex gap-2">
      <PageLink href={hasPrev && first ? toHref(filters, { before: first.id }) : null}>Previous</PageLink>
      <PageLink href={hasNext && last ? toHref(filters, { after: last.id }) : null}>Next</PageLink>
    </nav>
  );
}

function PageLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) {
    return (
      <Button variant="outline" size="sm" disabled>
        {children}
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={href}>{children}</Link>
    </Button>
  );
}

// decimal: columnas numeric(p,1). PostgREST las devuelve como número JSON (1.0 llega como 1),
// así que se formatean con un decimal fijo.
const COLUMNS: { key: keyof CoffeeHealthRow; label: string; numeric?: boolean; decimal?: boolean }[] = [
  { key: "id", label: "ID", numeric: true },
  { key: "age", label: "Age", numeric: true },
  { key: "gender", label: "Gender" },
  { key: "country", label: "Country" },
  { key: "coffee_intake", label: "Coffee (cups)", numeric: true, decimal: true },
  { key: "caffeine_mg", label: "Caffeine (mg)", numeric: true, decimal: true },
  { key: "sleep_hours", label: "Sleep (h)", numeric: true, decimal: true },
  { key: "sleep_quality", label: "Sleep quality" },
  { key: "bmi", label: "BMI", numeric: true, decimal: true },
  { key: "heart_rate", label: "Heart rate", numeric: true },
  { key: "stress_level", label: "Stress" },
  { key: "physical_activity_hours", label: "Activity (h)", numeric: true, decimal: true },
  { key: "health_issues", label: "Health issues" },
  { key: "occupation", label: "Occupation" },
  { key: "smoking", label: "Smoker" },
  { key: "alcohol_consumption", label: "Alcohol" },
];

function CoffeeTable({ rows }: { rows: CoffeeHealthRow[] }) {
  return (
    <div className="rounded-lg border">
      <Table aria-label="Coffee and health records">
        <TableHeader>
          <TableRow>
            {COLUMNS.map(({ key, label, numeric }) => (
              <TableHead key={key} className={numeric ? "text-right" : undefined}>
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMNS.length} className="h-24 text-center text-muted-foreground">
                No results match these filters.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                {COLUMNS.map(({ key, numeric, decimal }) => {
                  const value = row[key];
                  return (
                    <TableCell key={key} className={numeric ? "text-right tabular-nums" : undefined}>
                      {typeof value === "boolean"
                        ? value ? "Yes" : "No"
                        : decimal && typeof value === "number"
                          ? value.toFixed(1)
                          : value}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
