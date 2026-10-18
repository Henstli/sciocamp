"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "../../prihlaseni/login.module.css";

/**
 * Sem vede odkaz z pozvánky ve výchozím e-mailu Supabase. Přihlašovací údaje
 * jsou v části adresy za „#“, kterou server nevidí — proto je zpracuje prohlížeč.
 */
export function AcceptInvite() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void accept().then(setError);
  }, []);

  if (error) {
    return (
      <div className={styles.form}>
        <h1 className={styles.title}>Pozvánka nefunguje</h1>
        <p role="alert" className={styles.error}>
          {error}
        </p>
        <a href="/prihlaseni" className="btn btn-primary">
          Na přihlášení
        </a>
      </div>
    );
  }
  return (
    <div className={styles.form} role="status">
      <h1 className={styles.title}>Přijímám pozvánku…</h1>
      <p className={styles.subtitle}>Za chvilku si nastavíš heslo.</p>
    </div>
  );
}

/** Přečte údaje z adresy a přihlásí. Vrací chybovou hlášku, nebo null při úspěchu. */
async function accept(): Promise<string | null> {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  // Údaje hned smažeme z adresy, ať nezůstanou v historii prohlížeče.
  window.history.replaceState(null, "", window.location.pathname);

  if (!accessToken || !refreshToken) {
    return params.get("error_code") === "otp_expired"
      ? "Odkaz z pozvánky už vypršel. Požádej správce školy o novou pozvánku, nebo si nech poslat odkaz přes „Zapomenuté heslo?“."
      : "Odkaz z pozvánky je neplatný. Zkus ho otevřít znovu, nebo si nech poslat nový přes „Zapomenuté heslo?“.";
  }
  const { error } = await createClient().auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) return "Pozvánku se nepodařilo přijmout. Zkus odkaz otevřít znovu.";
  // Celé načtení stránky, aby server viděl nové cookies.
  window.location.replace("/nastavit-heslo");
  return null;
}
