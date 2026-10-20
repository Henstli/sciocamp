"use client";

// Správa → Oznámení: admin zveřejní důležitou zprávu zvýrazněně na Domově,
// vybere pro koho a do kdy; běžící může ukončit, staré smazat.

import { useActionState, useState, useTransition } from "react";
import { DueInput } from "../fields/DateTime";
import { createAnnouncement, deleteAnnouncement, endAnnouncement, type AnnouncementState } from "@/lib/actions/announcements";
import { keepForm } from "@/lib/use-keep-form";
import styles from "./announcements.module.css";

export type ManagedAnnouncement = {
  id: string;
  title: string;
  audience: string;
  status: string;
  ended: boolean;
  author: string;
};

export function AnnouncementManager({ items, live }: { items: ManagedAnnouncement[]; live: boolean }) {
  const [state, action, pending] = useActionState<AnnouncementState, FormData>(createAnnouncement, {});
  const [formKey, setFormKey] = useState(0);
  const [seenOk, setSeenOk] = useState<AnnouncementState | null>(null);
  const [msg, setMsg] = useState<{ error?: string }>({});
  const [busy, start] = useTransition();
  const fe = state.fieldErrors ?? {};

  // Po úspěšném zveřejnění vyčistit formulář (nový klíč = prázdná pole).
  if (state.ok && seenOk !== state) {
    setSeenOk(state);
    setFormKey((k) => k + 1);
  }

  const run = (fn: () => Promise<AnnouncementState>) =>
    start(async () => {
      const res = await fn();
      setMsg(res.error ? { error: res.error } : {});
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <form key={formKey} className={`card ${styles.form}`} onSubmit={keepForm(action)} aria-label="Nové oznámení">
        <div>
          <h2 className="section-title">Nové oznámení na Domov</h2>
          <p className={styles.hint}>
            Ukáže se zvýrazněně nahoře na Domově a přijde i do zvonečku. Každý si ho může skrýt tlačítkem „Rozumím“.
          </p>
        </div>
        <label className={styles.field}>
          Nadpis
          <input name="title" className={styles.input} maxLength={120} placeholder="Např. V pátek odpadá výuka" required />
          {fe.title && <span className={styles.error}>{fe.title}</span>}
        </label>
        <label className={styles.field}>
          Text (nepovinné)
          <textarea name="body" className={styles.input} maxLength={1500} placeholder="Podrobnosti, co to znamená a co mají lidé udělat." />
          {fe.body && <span className={styles.error}>{fe.body}</span>}
        </label>
        <div className={styles.grid}>
          <label className={styles.field}>
            Pro koho
            <select name="audience" className={styles.input} defaultValue="vsichni">
              <option value="vsichni">Všichni</option>
              <option value="studenti">Jen studenti</option>
              <option value="vyucujici">Jen učitelé a admini</option>
            </select>
            {fe.audience && <span className={styles.error}>{fe.audience}</span>}
          </label>
          <div className={styles.field}>
            Zobrazovat do (nepovinné)
            <DueInput name="endsAt" label="konce oznámení" />
            <span className={styles.hint}>Bez data zůstane, dokud ho neukončíš.</span>
            {fe.endsAt && <span className={styles.error}>{fe.endsAt}</span>}
          </div>
          <label className={styles.field}>
            Odkaz (nepovinné)
            <input name="link" className={styles.input} placeholder="https://…" />
            {fe.link && <span className={styles.error}>{fe.link}</span>}
          </label>
        </div>
        <div className={styles.actions}>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Zveřejňuji…" : "Zveřejnit na Domově"}
          </button>
          {state.error && <span className={styles.msgError}>{state.error}</span>}
          {state.info && <span className={styles.msgInfo}>{state.info}</span>}
          {!live && <span className={styles.hint}>Ukázkový režim: oznámení se neuloží.</span>}
        </div>
      </form>

      <section className="card" style={{ overflow: "hidden" }} aria-label="Oznámení">
        <div style={{ padding: "16px 20px" }}>
          <h2 className="section-title">Oznámení</h2>
          {msg.error && <p className={styles.msgError}>{msg.error}</p>}
        </div>
        {items.length === 0 ? (
          <p className={styles.empty}>Zatím žádné oznámení.</p>
        ) : (
          <ul className={styles.list}>
            {items.map((a) => (
              <li key={a.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>{a.title}</div>
                  <div className={styles.rowMeta}>
                    {a.audience} · {a.author}
                  </div>
                </div>
                <span className={styles.chip} data-ended={a.ended}>
                  {a.status}
                </span>
                {!a.ended && (
                  <button type="button" className={styles.small} disabled={busy} onClick={() => run(() => endAnnouncement(a.id))}>
                    Ukončit
                  </button>
                )}
                <button
                  type="button"
                  className={`${styles.small} ${styles.smallDanger}`}
                  disabled={busy}
                  onClick={() => run(() => deleteAnnouncement(a.id))}
                >
                  Smazat
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
