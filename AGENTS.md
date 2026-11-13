# Project rules
- Stack: Next.js (App Router, Server Components), local Supabase (Docker), pnpm, Vitest.
- Filtering and pagination ALWAYS on the server (Postgres). Never fetch all rows to the client.
- Filters live in the URL (searchParams).
- Use components from components/ui/ before creating new ones.
- Schema changes only through migrations in supabase/migrations/.
- Never commit .env.local or secrets.
- Small, explained changes; before editing, explain what you will do and why.
- Do not install new libraries without asking.
