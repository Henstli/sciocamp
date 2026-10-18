"use client";

import { keepForm } from "@/lib/use-keep-form";
import { useActionState, useState } from "react";
import { updateMeetUrl, type MeetState } from "@/lib/actions/meet";
import styles from "./classroom.module.css";

/** Úprava odkazu na Meet pro vyučující a admina (v panelu „Příští hodina“). */
export function MeetEditor({ activity, current }: { activity: string; current: string | null }) {
  const [state, action, pending] = useActionState<MeetState, FormData>(updateMeetUrl, {});
  const [open, setOpen] = useState(!current);

  if (!open) {
    return (
      <button type="button" className={styles.linkButton} onClick={() => setOpen(true)}>
        Změnit odkaz na Meet
      </button>
    );
  }

  return (
    <form onSubmit={keepForm(action)} className={styles.meetForm}>
      <input type="hidden" name="activity" value={activity} />
      <label htmlFor="meet-url" className={styles.strong}>
        Odkaz na Meet pro celý blok
      </label>
      <input
        id="meet-url"
        name="meetUrl"
        type="text"
        inputMode="url"
        defaultValue={current ?? ""}
        placeholder="https://meet.google.com/abc-defg-hij"
        className={styles.composerInput}
        aria-describedby="meet-help"
      />
      <p id="meet-help" className={styles.meta}>
        Nemáš odkaz?{" "}
        <a href="https://meet.google.com/new" target="_blank" rel="noopener noreferrer">
          Vytvoř nový Meet
        </a>
        , zkopíruj jeho adresu a vlož ji sem. Prázdné pole odkaz odebere.
      </p>
      {(state.error || state.info) && (
        <p role="status" className={state.error ? styles.formError : styles.meta}>
          {state.error ?? state.info}
        </p>
      )}
      <div className={styles.meetActions}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Ukládám…" : "Uložit"}
        </button>
        {current && (
          <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
            Zrušit
          </button>
        )}
      </div>
    </form>
  );
}
