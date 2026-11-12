import { Constants, type Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];
export type CoffeeHealthRow = Database["public"]["Tables"]["coffee_health"]["Row"];

export const PAGE_SIZE = 50;

// Selección múltiple sobre columnas enum: las opciones salen de los tipos generados
// (pnpm db:types), así no se duplican los valores del esquema.
export const ENUM_FILTERS = {
  gender: { label: "Gender", options: Constants.public.Enums.gender },
  sleep_quality: { label: "Sleep quality", options: Constants.public.Enums.sleep_quality },
  stress_level: { label: "Stress level", options: Constants.public.Enums.stress_level },
  health_issues: { label: "Health issues", options: Constants.public.Enums.health_issues },
  occupation: { label: "Occupation", options: Constants.public.Enums.occupation },
} as const;
export type EnumFilterKey = keyof typeof ENUM_FILTERS;
export const ENUM_FILTER_KEYS = Object.keys(ENUM_FILTERS) as EnumFilterKey[];

// Rangos min/max; en la URL van como <columna>_min y <columna>_max.
export const RANGE_FILTERS = {
  age: { label: "Age", step: 1 },
  coffee_intake: { label: "Coffee (cups/day)", step: 0.1 },
  sleep_hours: { label: "Sleep (hours)", step: 0.1 },
  bmi: { label: "BMI", step: 0.1 },
} as const;
export type RangeFilterKey = keyof typeof RANGE_FILTERS;
export const RANGE_FILTER_KEYS = Object.keys(RANGE_FILTERS) as RangeFilterKey[];

export type Range = { min?: number; max?: number };

export type Filters = { country: string[] } & { [K in EnumFilterKey]: Enums[K][] } & {
  [K in RangeFilterKey]: Range;
};

// Paginación por keyset sobre id: `after` = página siguiente, `before` = anterior.
export type Cursor = { after: number } | { before: number } | null;

export type SearchParams = Record<string, string | string[] | undefined>;

const values = (sp: SearchParams, key: string) => [sp[key] ?? []].flat().filter((v) => v !== "");

const toNumber = (v: string | undefined) => {
  const n = Number(v);
  return v !== undefined && Number.isFinite(n) ? n : undefined;
};

const toId = (v: string | undefined) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
};

/** Lee y valida los filtros de la URL. Lo inválido se descarta en silencio. */
export function parseSearchParams(sp: SearchParams): { filters: Filters; cursor: Cursor } {
  const enumFilters = Object.fromEntries(
    ENUM_FILTER_KEYS.map((key) => {
      const allowed: readonly string[] = ENUM_FILTERS[key].options;
      return [key, values(sp, key).filter((v) => allowed.includes(v))];
    }),
  ) as { [K in EnumFilterKey]: Enums[K][] };

  const rangeFilters = Object.fromEntries(
    RANGE_FILTER_KEYS.map((key) => [
      key,
      { min: toNumber(values(sp, `${key}_min`)[0]), max: toNumber(values(sp, `${key}_max`)[0]) },
    ]),
  ) as { [K in RangeFilterKey]: Range };

  const after = toId(values(sp, "after")[0]);
  const before = toId(values(sp, "before")[0]);

  return {
    // country es text (dominio abierto): se pasa tal cual; PostgREST lo parametriza.
    filters: { country: values(sp, "country"), ...enumFilters, ...rangeFilters },
    cursor: after ? { after } : before ? { before } : null,
  };
}

/** Inversa de parseSearchParams: URL canónica para links de paginación y "limpiar". */
export function toSearchParams(filters: Filters, cursor: Cursor = null): URLSearchParams {
  const params = new URLSearchParams();
  for (const v of filters.country) params.append("country", v);
  for (const key of ENUM_FILTER_KEYS) for (const v of filters[key]) params.append(key, v);
  for (const key of RANGE_FILTER_KEYS) {
    const { min, max } = filters[key];
    if (min !== undefined) params.set(`${key}_min`, String(min));
    if (max !== undefined) params.set(`${key}_max`, String(max));
  }
  if (cursor && "after" in cursor) params.set("after", String(cursor.after));
  if (cursor && "before" in cursor) params.set("before", String(cursor.before));
  return params;
}

/** Href de la página con esos filtros; "/" si no hay ninguno. */
export function toHref(filters: Filters, cursor: Cursor = null): string {
  const qs = toSearchParams(filters, cursor).toString();
  return qs ? `/?${qs}` : "/";
}
