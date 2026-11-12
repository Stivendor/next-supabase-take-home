#!/usr/bin/env bash
# Genera supabase/seeds/coffee_health.sql a partir del CSV.
# `supabase db reset` lo carga después de las migraciones (ver [db.seed] en config.toml).
# Volver a correrlo si cambia el CSV.
#
# ponytail: INSERT por lotes de 1000 filas porque el seed del CLI de Supabase no
# soporta COPY FROM stdin. Para millones de filas, cargar con COPY directo a Postgres.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CSV=data/synthetic_coffee_health_10000.csv
OUT=supabase/seeds/coffee_health.sql
EXPECTED_HEADER="ID,Age,Gender,Country,Coffee_Intake,Caffeine_mg,Sleep_Hours,Sleep_Quality,BMI,Heart_Rate,Stress_Level,Physical_Activity_Hours,Health_Issues,Occupation,Smoking,Alcohol_Consumption"
COLUMNS="id, age, gender, country, coffee_intake, caffeine_mg, sleep_hours, sleep_quality, bmi, heart_rate, stress_level, physical_activity_hours, health_issues, occupation, smoking, alcohol_consumption"

# Las columnas se asignan por posición: un CSV reordenado cargaría valores en la
# columna equivocada sin error (p. ej. Sleep_Hours <-> BMI).
header="$(head -n1 "$CSV" | tr -d '\r')"
if [[ "$header" != "$EXPECTED_HEADER" ]]; then
  echo "error: header inesperado en $CSV" >&2
  echo "  esperado: $EXPECTED_HEADER" >&2
  echo "  actual:   $header" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
{
  echo "-- Generado por scripts/gen-coffee-seed.sh desde $CSV. No editar a mano."
  tail -n +2 "$CSV" | tr -d '\r' | awk -F, -v q="'" -v cols="$COLUMNS" -v batch=1000 '
    BEGIN {
      # Columnas de texto, enum y boolean (0/1) van entre comillas; el resto es numérico.
      split("3 4 8 11 13 14 15 16", idx, " ")
      for (i in idx) quoted[idx[i]] = 1
    }
    NF != 16 { printf "error: línea %d tiene %d columnas\n", NR + 1, NF > "/dev/stderr"; failed = 1; exit }
    {
      row = ""
      for (i = 1; i <= NF; i++) {
        v = $i
        if (i in quoted) {
          gsub(q, q q, v)
          v = q v q
        } else if (v !~ /^-?[0-9]+(\.[0-9]+)?$/) {
          printf "error: línea %d, columna %d no es numérica: %s\n", NR + 1, i, v > "/dev/stderr"
          failed = 1
          exit
        }
        row = row (i > 1 ? ", " : "") v
      }
      if ((NR - 1) % batch == 0) printf "insert into public.coffee_health (%s) values\n", cols
      else printf ",\n"
      printf "  (%s)", row
      if (NR % batch == 0) printf ";\n"
    }
    END {
      if (failed) exit 1
      if (NR % batch != 0) printf ";\n"
    }
  '
  # Estadísticas frescas para el planner tras la carga masiva.
  echo "analyze public.coffee_health;"
} > "$OUT"

echo "Wrote $OUT ($(tail -n +2 "$CSV" | wc -l | tr -d ' ') filas)"
