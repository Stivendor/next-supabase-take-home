# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Take-home de Medallo.dev: Next.js 16 (App Router) + Supabase local en Docker. Ejercicio (ver sección *Exercise* de `README.md`): cargar `data/synthetic_coffee_health_10000.csv` (10.000 filas, 16 columnas) en Postgres y mostrarlo en una tabla filtrable, diseñando para escalar a cientos de miles o millones de filas. La entrega incluye notas breves sobre esquema, importación, estrategia de filtrado y decisiones de escala.

Reglas obligatorias del proyecto: @AGENTS.md

## Comandos

Usar **pnpm** (Node ≥ 24, pnpm ≥ 10). Existe también `package-lock.json`, pero el lockfile de referencia es `pnpm-lock.yaml`. Docker debe estar corriendo.

```bash
pnpm install
pnpm setup:env          # supabase start + escribe .env.local (script bash: en Windows requiere Git Bash)
pnpm dev                # dev:supabase + next dev en paralelo (concurrently)
pnpm dev:next           # solo Next.js
pnpm dev:supabase       # solo Supabase, sin storage/realtime/edge functions/logs/correo (flag -x)
pnpm build
pnpm lint               # eslint . (flat config: next/core-web-vitals + next/typescript)
pnpm test               # vitest en modo watch
pnpm test:run           # vitest una vez
pnpm vitest run path/to/file.test.ts   # un solo archivo
pnpm vitest run -t "nombre del test"   # un solo test por nombre
```

Base de datos:

```bash
pnpm db:seed:gen                            # regenera supabase/seeds/coffee_health.sql desde el CSV
pnpm db:types                               # regenera lib/database.types.ts (correr tras cada migración)
pnpm exec supabase migration new <nombre>   # crea supabase/migrations/<timestamp>_<nombre>.sql
pnpm exec supabase db reset                 # recrea la DB: migraciones + seed.sql
pnpm exec supabase migration up             # aplica migraciones pendientes sin reset
pnpm exec supabase status                   # URLs y claves locales
```

Puertos locales: API 54321, Postgres 54322 (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), Studio 54323.

## Arquitectura

### Supabase (`supabase/`)

- **Cambios de esquema solo con migraciones** en `supabase/migrations/` (regla de AGENTS.md), escritas con `supabase migration new`. `config.toml` también activa esquemas declarativos (`schema_paths = ["./schemas/*.sql"]`, con `notes.sql` de ejemplo): no usar `supabase db diff`, porque toma `supabase/schemas/` como fuente de verdad y puede generar `DROP` de tablas que solo existen en migraciones.
- `db reset` ejecuta `seed.sql` y luego `seeds/*.sql`. `seeds/coffee_health.sql` (10.000 filas en `public.coffee_health`) lo genera `scripts/gen-coffee-seed.sh`; no editarlo a mano. Usa INSERT por lotes porque el seed del CLI no soporta `COPY ... FROM stdin`.
- `dev:supabase` excluye servicios con `-x` usando nombres de imagen (`storage-api`, `logflare`, `mailpit`…). Los nombres que muestra `supabase start --help` (`storage`, `analytics`, `inbucket`) se ignoran con un warning. `vector` falla en Docker Desktop para Windows (no accede al socket de Docker); `pnpm setup:env` todavía arranca todo.
- **`[api] max_rows = 1000`**: PostgREST devuelve como máximo 1000 filas por request. Consultas con supabase-js sobre el dataset completo se truncan sin error; paginar con `.range()` y obtener totales con `count`.
- Tablas con RLS habilitado. Una tabla nueva con RLS y sin policy devuelve 0 filas al rol `anon`.

### Clientes Supabase (`lib/supabase/`)

- `client.ts`: `createBrowserClient` para Client Components (clave anon).
- `server.ts`: `createClient()` async basado en cookies para Server Components, Server Actions y Route Handlers. `createPublicClient()` (tipado con `Database`, clave anon, sin cookies) para datos públicos; es el único usable dentro de `"use cache"`. `createAdminClient()` usa `SUPABASE_SECRET_KEY` y salta RLS; solo para código de servidor confiable.
- `proxy.ts`: `updateSession()` para refrescar sesión. **No está conectado**: no existe `proxy.ts` en la raíz (Next 16 renombró `middleware.ts` a `proxy.ts`). Si se conecta tal cual, redirige toda ruta distinta de `/` sin usuario a `/auth/login`, ruta que no existe.
- Crear un cliente nuevo por request; no guardarlo en variables globales.

Variables de entorno (`.env.local`, generado por `scripts/setup-env.sh` a partir de `supabase status -o env`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key), `SUPABASE_SECRET_KEY`. El README menciona `.env.example`, pero no existe (y `.gitignore` lo ignoraría por el orden de reglas).

### Next.js

- `next.config.ts` activa `cacheComponents: true` (Cache Components de Next 16). Acceder a datos dinámicos (`cookies()`, `searchParams`, consultas sin caché) exige envolver el componente en `<Suspense>` o usar `"use cache"`; si no, falla el prerender.
- `app/page.tsx` (`/`): tabla filtrable de `coffee_health`. Los filtros viven en la URL y se leen/validan en `lib/coffee-health.ts` (`parseSearchParams` / `toHref`, con tests). `app/coffee-filters.tsx` es un `<Form>` GET de `next/form`. La consulta corre en el servidor: paginación keyset por `id` (`after`/`before`, 50 filas) y conteo exacto en su propio `<Suspense>`. No usar `count: "estimated"`: PostgREST planifica con parámetros y la estimación erraba ~30% con rangos. Los países salen de la vista `coffee_health_countries`, cacheada con `"use cache"`.
- UI: shadcn/ui estilo new-york (`components.json`, componentes en `components/ui/`), Tailwind CSS **v3** (`tailwind.config.ts` + `tailwindcss-animate`), iconos lucide, temas con `next-themes` (clase `dark`). Helper `cn()` en `lib/utils.ts`. Alias `@/*` = raíz del repo.

### Tests

Vitest con jsdom y `@vitejs/plugin-react`; incluye `**/*.{test,spec}.{ts,tsx}` con `passWithNoTests`. Tests actuales: `lib/coffee-health.test.ts`.
