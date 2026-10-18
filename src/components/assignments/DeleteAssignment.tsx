"use client";

import { useState, useTransition } from "react";
import { deleteAssignment } from "@/lib/actions/assignments";
import styles from "../manage/manage.module.css";

/** Smazání úkolu ve dvou krocích. */
export function DeleteAssignment({ id, title }: { id: string; title: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  return (
    <section className={`card ${styles.danger}`} aria-label="Smazat úkol">
      <div>
        <h2 className="section-title">Smazat</h2>
        <p className={styles.hint}>Smažou se i odevzdané práce, hodnocení a komentáře. Nejde to vrátit.</p>
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
                const res = await deleteAssignment(id);
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
