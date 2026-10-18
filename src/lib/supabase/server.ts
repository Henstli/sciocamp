import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config";

/** Klient jako přihlášený uživatel — všechny dotazy procházejí přes RLS. Jeden na požadavek. */
export const createClient = cache(async () => {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Volané ze Server Component: cookies tu nastavit nejde, session obnoví proxy.
        }
      },
    },
  });
});

/**
 * Klient se secret key — obchází RLS. Jen pro serverové akce admina
 * (pozvánky, změna role) a vždy až po kontrole requireAdmin().
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Chybí SUPABASE_SECRET_KEY v proměnných prostředí.");
  return createPlainClient(SUPABASE_URL, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
