"use client";

import { useActionState, useState, useTransition } from "react";
import { DateInput } from "@/components/fields/DateTime";
import { deletePeriod, savePeriod, type PeriodState } from "@/lib/actions/periods";
import { formatDateRange } from "@/lib/periods";
import { keepForm } from "@/lib/use-keep-form";
import styles from "./admin.module.css";

export type PeriodRow = { id: string; name: string; startsOn: string; endsOn: string; activities: number; current: boolean };

/** Kurzová období (4 za rok): admin je zakládá, kurzy a ateliéry se do nich řadí. */
export function PeriodManager({ periods }: { periods: PeriodRow[] }) {
  const [editing, setEditing] = useState<PeriodRow | "new" | null>(periods.length === 0 ? "new" : null);
  const [msg, setMsg] = useState<PeriodState>({});
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section aria-label="Kurzová období" className={`card ${styles.table}`}>
      <div className={styles.toolbar}>
        <div>
          <h2 className="section-title">Kurzová období</h2>
          <p className={styles.inviteNote}>
            Za rok jsou 4 období, 2 v každém pololetí. Kurz trvá celé období, ateliéry se během něj střídají.
          </p>
        </div>
        {editing === null && (
          <button type="button" className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setEditing("new")}>
            + Nové období
          </button>
        )}
      </div>

      {editing !== null && (
        <PeriodForm
          key={editing === "new" ? "new" : editing.id}
          period={editing === "new" ? null : editing}
          suggestedName={`Kurzové období ${periods.length + 1}`}
          onClose={() => setEditing(null)}
        />
      )}

      {periods.map((p) => (
        <div key={p.id} className={styles.courseRow}>
          <div className={styles.courseMain}>
            <div className={styles.name}>
              {p.name} {p.current && <span className="chip chip-ok">Právě běží</span>}
            </div>
            <div className={styles.email}>
              {formatDateRange(p.startsOn, p.endsOn)} {p.startsOn.slice(0, 4)} · {p.activities}{" "}
              {p.activities === 1 ? "aktivita" : p.activities >= 2 && p.activities <= 4 ? "aktivity" : "aktivit"}
            </div>
          </div>
          <button type="button" className="btn btn-outline" style={{ minHeight: 40 }} onClick={() => setEditing(p)}>
            Upravit
          </button>
          {confirm === p.id ? (
            <button
              type="button"
              className="btn btn-outline"
              style={{ minHeight: 40, color: "var(--late)", borderColor: "#e7b4b4" }}
              disabled={pending}
              onClick={() => start(async () => setMsg(await deletePeriod(p.id)))}
            >
              Opravdu smazat?
            </button>
          ) : (
            <button type="button" className="btn btn-outline" style={{ minHeight: 40 }} onClick={() => setConfirm(p.id)}>
              Smazat
            </button>
          )}
        </div>
      ))}
      {periods.length === 0 && editing === null && <p className={styles.footer}>Zatím žádné období.</p>}
      {(msg.error || msg.info) && (
        <p role="status" className={msg.error ? styles.msgError : styles.footer}>
          {msg.error ?? msg.info}
        </p>
      )}
    </section>
  );
}

function PeriodForm({ period, suggestedName, onClose }: { period: PeriodRow | null; suggestedName: string; onClose: () => void }) {
  const [state, action, pending] = useActionState<PeriodState, FormData>(savePeriod, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form onSubmit={keepForm(action)} className={styles.periodForm} noValidate>
      {period && <input type="hidden" name="id" value={period.id} />}
      <div className={styles.inviteGrid}>
        <label className={styles.field}>
          Název
          <input name="name" defaultValue={period?.name ?? suggestedName} className={styles.textInput} />
          {fe.name && <span className={styles.msgError}>{fe.name}</span>}
        </label>
        <div className={styles.field}>
          Od
          <DateInput name="startsOn" defaultValue={period?.startsOn ?? ""} ariaLabel="Začátek období" />
          {fe.startsOn && <span className={styles.msgError}>{fe.startsOn}</span>}
        </div>
        <div className={styles.field}>
          Do
          <DateInput name="endsOn" defaultValue={period?.endsOn ?? ""} ariaLabel="Konec období" />
          {fe.endsOn && <span className={styles.msgError}>{fe.endsOn}</span>}
        </div>
      </div>
      {(state.error || state.info) && (
        <p role="status" className={state.error ? styles.msgError : styles.inviteNote}>
          {state.error ?? state.info}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Ukládám…" : period ? "Uložit" : "Založit období"}
        </button>
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Zavřít
        </button>
      </div>
    </form>
  );
}
