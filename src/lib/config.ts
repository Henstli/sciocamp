// Režim aplikace: s vyplněnými proměnnými Supabase běží naostro,
// bez nich v ukázkovém režimu s daty z src/lib/demo-data.ts.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const isSupabase = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

/**
 * Přihlášení přes Google je zapnuté v Supabase (Authentication → Providers → Google).
 * Dokud není, tlačítko jen vysvětlí, že se zatím přihlašuje e-mailem a heslem.
 */
export const isGoogleEnabled = process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "1";

/** Přihlásit se smí jen školní účty (Google i e-mail + heslo). Stejná hodnota je v databázi: public.school_domain(). */
export const SCHOOL_DOMAIN = "scioskola.cz";

export function isSchoolEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase().endsWith(`@${SCHOOL_DOMAIN}`);
}
