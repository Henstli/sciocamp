"use client";

import { useState, useTransition } from "react";
import { deleteActivity } from "@/lib/actions/activities";
import styles from "./manage.module.css";

/** Smazání ve dvou krocích, bez vyskakovacího okna prohlížeče. */
export function DeleteActivity({ slug, title }: { slug: string; title: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  return (
    <section className={`card ${styles.danger}`} aria-label="Smazat aktivitu">
      <div>
        <h2 className="section-title">Smazat</h2>
        <p className={styles.hint}>Smaže se i rozvrh a zápisy studentů. Nejde to vrátit.</p>
      </div>
      {!confirming ? (
        <button type="button" className={`btn ${styles.dangerBtn}`} onClick={() => setConfirming(true)}>
          Smazat „{title}“
        </button>
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={`btn ${styles.dangerSolid}`}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteActivity(slug);
                if (res?.error) setError(res.error);
              })
            }
          >
            {pending ? "Mažu…" : "Ano, smazat natrvalo"}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setConfirming(false)}>
            Ne, nechat
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className={styles.formError}>
          {error}
        </p>
      )}
    </section>
  );
}
