"use server";

import { redirect } from "next/navigation";
import { endSession, startDemoSession } from "@/lib/auth";
import { SCHOOL_DOMAIN, isGoogleEnabled, isSchoolEmail, isSupabase } from "@/lib/config";
import { getUserByEmail, getUserById, listDemoAccounts } from "@/lib/data";
import { siteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; info?: string; email?: string };

const DOMAIN_ERROR = `Přihlásit se dá jen školním e-mailem @${SCHOOL_DOMAIN}.`;

/** Přihlášení přes Google. Doménu ověřujeme znovu po návratu v /auth/callback. */
export async function loginWithGoogle() {
  if (!isSupabase || !isGoogleEnabled) redirect("/prihlaseni?chyba=google-vypnuto");
  const sb = await createClient();
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await siteUrl()}/auth/callback`,
      // hd jen předvybere školní účty v nabídce Googlu; skutečná kontrola je na serveru.
      queryParams: { hd: SCHOOL_DOMAIN, prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/prihlaseni?chyba=google");
  redirect(data.url);
}

/** Ukázkový režim: přihlášení jedním z ukázkových účtů. */
export async function loginAsDemo(formData: FormData) {
  if (isSupabase) redirect("/prihlaseni");
  const id = String(formData.get("userId") ?? "");
  const allowed = (await listDemoAccounts()).some((u) => u.id === id);
  const user = allowed ? await getUserById(id) : null;
  if (!user) redirect("/prihlaseni");
  await startDemoSession(user.id, true);
  redirect("/");
}

/** Přihlášení školním e-mailem a heslem (v ukázkovém režimu se heslo nekontroluje). */
export async function loginWithEmail(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";
  if (!email) return { error: "Vyplň školní e-mail." };
  if (!isSchoolEmail(email)) return { error: DOMAIN_ERROR, email };

  if (isSupabase) {
    if (!password) return { error: "Vyplň heslo.", email };
    const sb = await createClient();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      return {
        error:
          error.code === "invalid_credentials"
            ? "E-mail nebo heslo nesedí. Pokud heslo ještě nemáš, použij odkaz z pozvánky nebo „Zapomenuté heslo?“."
            : "Přihlášení se nepovedlo. Zkus to prosím znovu.",
        email,
      };
    }
    redirect("/");
  }

  const user = await getUserByEmail(email);
  if (!user) return { error: "Tenhle e-mail ve škole nemáme. Účty zakládá správce školy.", email };
  if (!user.active) return { error: "Účet ještě není aktivní. Přijmi pozvánku z e-mailu.", email };
  await startDemoSession(user.id, remember);
  redirect("/");
}

/** Pošle odkaz na nastavení nového hesla. Odpověď je stejná, ať účet existuje, nebo ne. */
export async function requestPasswordReset(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isSchoolEmail(email)) return { error: DOMAIN_ERROR, email };
  if (!isSupabase) return { info: "V ukázkovém režimu se e-maily neposílají.", email };
  const sb = await createClient();
  await sb.auth.resetPasswordForEmail(email, { redirectTo: `${await siteUrl()}/auth/callback?next=/nastavit-heslo` });
  return { info: "Pokud ve škole účet s tímto e-mailem máme, poslali jsme na něj odkaz na nastavení hesla.", email };
}

export async function logout() {
  await endSession();
  redirect("/prihlaseni");
}
