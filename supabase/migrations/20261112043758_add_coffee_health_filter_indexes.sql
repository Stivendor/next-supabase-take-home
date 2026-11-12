-- Índices para los filtros de la tabla, elegidos midiendo con EXPLAIN ANALYZE sobre 1M filas.
--
-- Solo country y age: con RLS activo (rol anon, el de PostgREST) el planner usa estadísticas
-- únicamente con operadores leakproof. texteq e int2ge lo son; enum_eq y numeric_ge no, así que
-- para columnas enum y numeric el planner estima con selectividad por defecto y no elige sus
-- índices (probado: índices en esas columnas quedaron con idx_scan = 0).
--
-- Medido a 1M filas: count por país ~45 ms -> ~7 ms (index-only scan); edad rara + país
-- ~43 ms -> ~6 ms (BitmapAnd). La paginación sin filtros o con filtros comunes ya usa el PK.
--
-- ponytail: CREATE INDEX normal bloquea escrituras mientras se construye. Con la tabla grande en
-- producción, crearlos con CONCURRENTLY fuera de una transacción.
create index coffee_health_country_idx on public.coffee_health (country);
create index coffee_health_age_idx on public.coffee_health (age);
