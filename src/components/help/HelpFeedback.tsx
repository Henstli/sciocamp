"use client";

import { useState, useTransition } from "react";
import { saveHelpFeedback } from "@/lib/actions/help";
import styles from "./help.module.css";

/** „Pomohl ti návod?“ Ano / Ne — po kliknutí poděkování, odpověď jde změnit. */
export function HelpFeedback({ slug, initial, live }: { slug: string; initial: boolean | null; live: boolean }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const answer = (helpful: boolean) => {
    const before = value;
    setValue(helpful);
    setError(null);
    start(async () => {
      const res = await saveHelpFeedback(slug, helpful);
      if (res.error) {
        setValue(before);
        setError(res.error);
      }
    });
  };
  return (
    <div className={styles.feedback} role="group" aria-label="Pomohl ti návod?">
      <span>{value === null ? "Pomohl ti návod?" : value ? "Díky, rádi pomáháme!" : "Díky, návod vylepšíme."}</span>
      <button type="button" className={styles.fbBtn} aria-pressed={value === true} onClick={() => answer(true)}>
        Ano
      </button>
      <button type="button" className={styles.fbBtn} aria-pressed={value === false} onClick={() => answer(false)}>
        Ne
      </button>
      {!live && value !== null && <span className={styles.fbNote}>Ukázkový režim: odpověď se neukládá.</span>}
      {error && (
        <span role="alert" className={styles.fbNote}>
          {error}
        </span>
      )}
    </div>
  );
}
