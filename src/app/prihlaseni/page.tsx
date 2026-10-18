import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/components/Icon";
import { getCurrentUser } from "@/lib/auth";
import { SCHOOL_DOMAIN, isGoogleEnabled, isSupabase } from "@/lib/config";
import { listDemoAccounts } from "@/lib/data";
import { roleCaption } from "@/lib/roles";
import { LoginForm } from "./LoginForm";
import styles from "./login.module.css";

export const metadata: Metadata = { title: "Přihlášení" };

export default function LoginPage({ searchParams }: PageProps<"/prihlaseni">) {
  return (
    <div className={styles.page}>
      <section aria-label="O aplikaci" className={styles.hero}>
        <div aria-hidden="true" className={`${styles.blob} ${styles.blob1}`} />
        <div aria-hidden="true" className={`${styles.blob} ${styles.blob2}`} />
        <div aria-hidden="true" className={`${styles.blob} ${styles.blob3}`} />

        <div className={styles.brand}>
          <div className={styles.brandMark}>
            <Icon name="logo" size={24} />
          </div>
          <div className={styles.brandName}>ScioCamp</div>
        </div>

        <div className={styles.pitch}>
          <h1>Celý kemp na jednom místě.</h1>
          <p>Rozvrh, zápisy do kurzů, úkoly, hlasování i zprávy. Pro studenty, učitele i vedení.</p>
        </div>

        <div className={styles.pills}>
          {["Rozvrh", "Zápisy", "Úkoly", "Hlasování", "Zprávy"].map((p) => (
            <span key={p}>{p}</span>
          ))}
        </div>
      </section>

      <main className={styles.main}>
        <Suspense fallback={<div className={styles.form} aria-busy="true" />}>
          <LoginGate searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

/** Přihlášeného pošle rovnou na Domov, ostatním ukáže formulář. */
async function LoginGate({ searchParams }: { searchParams: PageProps<"/prihlaseni">["searchParams"] }) {
  if (await getCurrentUser()) redirect("/");
  const { chyba } = await searchParams;
  const demo = (await listDemoAccounts()).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    caption: roleCaption(u),
  }));
  const error = typeof chyba === "string" ? ERRORS[chyba] ?? ERRORS.odkaz : undefined;
  return <LoginForm demoAccounts={demo} live={isSupabase} googleEnabled={isGoogleEnabled} initialError={error} />;
}

const ERRORS: Record<string, string> = {
  domena: `Přihlásit se dá jen školním účtem @${SCHOOL_DOMAIN}.`,
  ucet: "Tenhle účet ve škole nemáme. Účty zakládá správce školy.",
  blokovano: "Účet je zablokovaný. Obrať se na správce školy.",
  google:
    "Přihlášení přes Google se nepovedlo. Studentům ho někdy blokuje nastavení školního Google účtu — přihlas se e-mailem a heslem.",
  "google-vypnuto": "Přihlášení přes Google zatím není zapnuté. Přihlas se školním e-mailem a heslem.",
  odkaz: "Odkaz je neplatný nebo vypršel. Zkus to znovu, nebo si nech poslat nový přes „Zapomenuté heslo?“.",
};
