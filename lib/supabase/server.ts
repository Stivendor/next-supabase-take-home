import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

/**
 * Especially important if using Fluid compute: Don't put this client in a
 * global variable. Always create a new client within each function when using
 * it.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have proxy refreshing
            // user sessions.
          }
        },
      },
    },
  );
}

/**
 * Cliente con la clave anon y sin cookies, para datos públicos (RLS de lectura
 * pública). No lee la request, así que se puede usar dentro de `"use cache"`.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

/**
 * Creates a Supabase client authenticated with the service secret key, without
 * reading or writing user session cookies. Use only in trusted server code
 * (Route Handlers, Server Actions, background jobs) when you need to bypass
 * Row Level Security or perform privileged operations such as admin auth APIs.
 * Never import this into Client Components or expose `SUPABASE_SECRET_KEY` to
 * the browser.
 *
 * Crea un cliente de Supabase autenticado con la clave secreta de servicio, sin
 * leer ni escribir cookies de sesión de usuario. Úsalo solo en código de
 * servidor de confianza (Route Handlers, Server Actions, trabajos en segundo
 * plano) cuando necesites omitir Row Level Security o realizar operaciones
 * privilegiadas, como las APIs de auth de administrador. Nunca lo importes en
 * Client Components ni expongas `SUPABASE_SECRET_KEY` al navegador.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
