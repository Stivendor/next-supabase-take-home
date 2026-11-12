# Notas de entrega

## Cómo correrlo

```bash
pnpm install
pnpm setup:env                # supabase start + escribe .env.local
pnpm exec supabase db reset   # migraciones + seed (10.000 filas)
pnpm dev                      # http://localhost:3000
```

## Esquema

- Una tabla, `public.coffee_health`. `id` es el ID del CSV (PK `bigint`), no se genera.
- Categóricas de dominio cerrado como `enum` (`gender`, `sleep_quality`, `stress_level`, `health_issues`, `occupation`): la DB valida al cargar, ocupan 4 bytes y conservan el orden semántico (Poor < Fair < Good < Excellent). Las opciones de los filtros salen de los tipos generados (`Constants` en `lib/database.types.ts`), sin duplicar valores en el código.
- `country` como `text`: dominio abierto. La lista del filtro sale de la vista `coffee_health_countries`.
- Decimales como `numeric(p,1)`, igual que el CSV: `bmi <= 24.5` filtra exacto, sin sorpresas de punto flotante. `Smoking` y `Alcohol_Consumption` (0/1) como `boolean`. Checks de rango en las columnas numéricas.
- Seguridad: RLS con policy de solo lectura, más `revoke all` y `grant select` (RLS no cubre `TRUNCATE`). La vista usa `security_invoker = true`.

## Importación

- `scripts/gen-coffee-seed.sh` (`pnpm db:seed:gen`) genera `supabase/seeds/coffee_health.sql`, que `db reset` carga después de las migraciones. Antes de generar, valida el header y que cada fila tenga 16 campos y números válidos.
- INSERT por lotes de 1.000 filas porque el seed del CLI de Supabase no soporta `COPY ... FROM stdin`. Para millones de filas usaría `COPY` directo a Postgres y crearía los índices después de la carga.
- Verificado contra el CSV: 10.000 filas, sumas de las columnas numéricas y conteos por categoría idénticos.

## Filtrado y paginación

- Todo en el servidor: Server Component → PostgREST → Postgres. El navegador recibe solo 50 filas por página.
- Los filtros viven en la URL (`?country=Japan&country=Spain&age_min=20`): se pueden compartir, funcionan atrás/adelante y no hay estado en el cliente. `lib/coffee-health.ts` los valida y descarta lo inválido (enum desconocido, números no finitos); tiene tests.
- Selección múltiple para categóricas (`in`), min/max para edad, café, sueño y BMI (`gte`/`lte`).
- Paginación keyset por `id` (`after`/`before`) en vez de `OFFSET`: cada página cuesta lo mismo. Un `OFFSET 900000` lee y descarta 900.000 filas.
- El conteo total va en su propio `<Suspense>`: la tabla se muestra sin esperarlo.

## Escala (medido con 1M filas)

Método: el dataset copiado ×100 (SQL al final), `EXPLAIN ANALYZE` como `anon` (el rol de PostgREST, con RLS) y tiempos HTTP contra PostgREST. Docker Desktop en Windows: los números tienen ruido, pero el orden de magnitud es fiable.

| Consulta | Tiempo |
| --- | --- |
| Página 1 sin filtros | ~1 ms en DB, ~30 ms por HTTP |
| Página tras `id` 900.000 | ~0,1 ms en DB, ~25 ms por HTTP |
| Página filtrando un país | < 1 ms en DB |
| Conteo exacto sin filtros | ~50–75 ms |
| Conteo de un país | ~7 ms (sin índice: ~40–55 ms) |
| Peor caso: combinación de filtros sin resultados | ~200–270 ms |

Decisiones:

1. **Keyset**: la paginación no se degrada con el tamaño ni con la profundidad de la página.
2. **Índices solo en `country` y `age`.** Hallazgo: con RLS activo, Postgres solo usa estadísticas con operadores *leakproof*. `texteq` e `int2ge` lo son; `enum_eq` y `numeric_ge` no. Como `anon`, `bmi >= 38` se estima en 500.000 filas (son 100) y `health_issues = 'Severe'` en 250.000 (son 1.700). Probé índices en las 10 columnas filtrables: los de enum y numeric quedaron con `idx_scan = 0` y los quité. Esto también explica por qué `count: "estimated"` erraba ~30% con rangos. Alternativas descartadas:
   - Quitar RLS: la tabla es pública y los grants ya limitan a `SELECT`, pero va contra la práctica de Supabase para tablas expuestas.
   - `real` en vez de `numeric`: vuelven las estadísticas, pero `bmi = 23.4` deja de coincidir (comparación float contra numeric) y la página seguía igual de lenta (punto 3).
   - Leer con `service_role`: salta RLS, pero rompe el mínimo privilegio para una lectura pública.
3. **Peor caso, `WHERE <filtro raro> ORDER BY id LIMIT 51`**: el planner asume que las coincidencias están repartidas y recorre el PK esperando encontrarlas pronto. Si casi no hay, lee toda la tabla (~200 ms a 1M filas, lineal con el tamaño). Pasa incluso con buenas estadísticas (probado con `real`). Red de seguridad: `statement_timeout = 3s` del rol `anon`. Si duele con datos reales: índices compuestos `(columna, id)` para los filtros que más se usen.
4. **Conteo exacto**: costo proporcional a las filas que cumplen el filtro; ~50 ms a 1M, ~10× a 10M. No bloquea la tabla. Siguiente paso: conteo con tope ("10,000+") vía una función RPC. No usaría el estimado con filtros, por el punto 2.
5. **Países**: la vista hace `DISTINCT` sobre toda la tabla (~80–110 ms a 1M), cacheada con `"use cache"` por horas porque solo cambia al recargar datos. Con más escala: una tabla de países.

## Supuestos y trade-offs

- La app solo lee; los datos cambian únicamente al recargar el dataset.
- Las copias ×100 conservan la distribución del CSV. Con datos reales las proporciones cambian y habría que volver a medir.
- Sin ordenar por columna: solo por `id`. Ordenar por otra columna requiere keyset compuesto `(columna, id)` y un índice por cada orden permitido.
- Los inputs vacíos dejan `age_min=` en la URL (el parser los ignora); quitarlos requeriría JS en el cliente.
- UI en inglés, como el dataset.
- `pnpm dev:supabase` excluye con `-x` los servicios de Supabase que no se usan (storage, realtime, edge functions, logs, correo). `vector` además falla en Docker Desktop para Windows.

## Reproducir con 1M filas

```sql
-- psql postgresql://postgres:postgres@127.0.0.1:54322/postgres
insert into public.coffee_health
select id + n * 10000, age, gender, country, coffee_intake, caffeine_mg, sleep_hours, sleep_quality,
       bmi, heart_rate, stress_level, physical_activity_hours, health_issues, occupation,
       smoking, alcohol_consumption
from public.coffee_health, generate_series(1, 99) n
where id <= 10000;
vacuum analyze public.coffee_health;

set role anon;  -- medir como PostgREST, con RLS
explain analyze select * from coffee_health where country in ('Japan') order by id limit 51;
```

`pnpm exec supabase db reset` vuelve a las 10.000 filas.
