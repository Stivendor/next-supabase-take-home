# Reglas del proyecto
- Stack: Next.js (App Router, Server Components), Supabase local (Docker), pnpm, Vitest.
- Filtrado y paginación SIEMPRE en el servidor (Postgres). Nunca traer todas las filas al cliente.
- Filtros viven en la URL (searchParams).
- Usar componentes de components/ui/ antes de crear nuevos.
- Cambios de esquema solo vía migraciones en supabase/migrations/.
- Nunca commitear .env.local ni secretos.
- Cambios pequeños y explicados; antes de editar, explica qué vas a hacer y por qué.
- No instalar librerías nuevas sin preguntar.
