"use client";

import { useState, useTransition } from "react";
import { bookConsultation } from "@/lib/actions/consultations";
import { formatSpan, slotEnd, toRanges } from "@/lib/consultations";
import styles from "@/app/(app)/konzultace/konzultace.module.css";

export type BoardCell =
  | { k: "free" }
  | { k: "mine"; id: string }
  | { k: "taken" }
  | { k: "off"; why: string }
  | { k: "clash"; why: string }
  | { k: "past" };

type Teacher = { id: string; name: string; short: string; initials: string };

/**
 * Tabulka pro studenty: řádky = 15min bloky, sloupce = vyučující. Volné bloky
 * jde zaškrtnout (u jednoho vyučujícího), sousední se zapíšou jako jedna konzultace.
 */
export function ConsultationBoard({
  fridays,
  slots,
  teachers,
  grid,
  rowNotes,
}: {
  /** Proč student v daném řádku nemůže (máš kurz, jinou konzultaci) */
  rowNotes: (string | null)[][];
  fridays: { day: string; label: string }[];
  slots: string[];
  teachers: Teacher[];
  grid: BoardCell[][][];
}) {
  const [fi, setFi] = useState(0);
  const [picked, setPicked] = useState<{ teacher: string; slots: string[] } | null>(null);
  const [msg, setMsg] = useState<{ error?: string; info?: string }>({});
  const [pending, start] = useTransition();

  if (fridays.length === 0) {
    return (
      <section className={`card ${styles.panel}`}>
        <h2 className="section-title">Zapsat se</h2>
        <p className={styles.muted}>Teď se nedá zapsat na žádný pátek.</p>
      </section>
    );
  }
  const day = fridays[fi].day;
  const toggle = (teacher: string, slot: string) => {
    setMsg({});
    setPicked((p) => {
      if (!p || p.teacher !== teacher) return { teacher, slots: [slot] };
      const next = p.slots.includes(slot) ? p.slots.filter((s) => s !== slot) : [...p.slots, slot];
      return next.length ? { teacher, slots: next } : null;
    });
  };
  const teacher = picked && teachers.find((t) => t.id === picked.teacher);
  const book = () =>
    picked &&
    start(async () => {
      const res = await bookConsultation(picked.teacher, day, picked.slots);
      setMsg(res.ok ? { info: "Zapsáno. Konzultace je v rozvrhu tvém i vyučujícího." } : res);
      if (res.ok) setPicked(null);
    });

  return (
    <section className={`card ${styles.panel}`} aria-label="Zapsat se na konzultaci">
      <div className={styles.head}>
        <h2 className="section-title">Zapsat se</h2>
        <div className={styles.tabs} role="tablist" aria-label="Pátek">
          {fridays.map((f, i) => (
            <button
              key={f.day}
              type="button"
              role="tab"
              aria-selected={i === fi}
              className={styles.tab}
              onClick={() => {
                setFi(i);
                setPicked(null);
                setMsg({});
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.legend}>
        <span data-k="free">Volno</span>
        <span data-k="picked">Vybráno</span>
        <span data-k="mine">Tvoje</span>
        <span data-k="taken">Obsazeno</span>
        <span data-k="off">Nenabízí / nemůžeš</span>
      </div>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.timeHead}>
                Čas
              </th>
              {teachers.map((t) => (
                <th key={t.id} scope="col" title={t.name}>
                  {t.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot, si) => (
              <tr key={slot}>
                <th scope="row" className={styles.time}>
                  {formatSpan(slot, slotEnd(slot))}
                  {rowNotes[fi]?.[si] && (
                    <span className={styles.rowNote} title={`Máš ${rowNotes[fi][si]}`}>
                      máš {rowNotes[fi][si]}
                    </span>
                  )}
                </th>
                {teachers.map((t, ti) => {
                  const cell = grid[fi]?.[ti]?.[si] ?? { k: "off", why: "" };
                  const isPicked = picked?.teacher === t.id && picked.slots.includes(slot);
                  if (cell.k === "free") {
                    return (
                      <td key={t.id}>
                        <button
                          type="button"
                          className={styles.cell}
                          data-k={isPicked ? "picked" : "free"}
                          aria-pressed={isPicked}
                          aria-label={`${t.name}, ${formatSpan(slot, slotEnd(slot))}`}
                          onClick={() => toggle(t.id, slot)}
                        />
                      </td>
                    );
                  }
                  const title =
                    cell.k === "mine" ? "Tvoje konzultace" : cell.k === "taken" ? "Obsazeno" : cell.k === "past" ? "Už proběhlo" : cell.why;
                  return (
                    <td key={t.id}>
                      <span className={styles.cell} data-k={cell.k === "clash" ? "off" : cell.k} title={title} aria-label={`${t.name}, ${formatSpan(slot, slotEnd(slot))}: ${title}`}>
                        {cell.k === "mine" ? "Ty" : cell.k === "taken" ? "×" : ""}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {picked && teacher && (
        <div className={styles.bar} role="status">
          <span>
            <strong>{teacher.name}</strong> · {fridays[fi].label} · {toRanges(picked.slots).map(([a, b]) => formatSpan(a, b)).join(", ")}
          </span>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={book}>
            {pending ? "Zapisuji…" : "Zapsat se"}
          </button>
          <button type="button" className="btn btn-soft" onClick={() => setPicked(null)}>
            Zrušit výběr
          </button>
        </div>
      )}
      {(msg.error || msg.info) && (
        <p role="status" className={msg.error ? styles.error : styles.info}>
          {msg.error ?? msg.info}
        </p>
      )}
      <p className={styles.muted}>Klikni na volné bloky u jednoho vyučujícího. Sousední bloky se spojí do jedné konzultace.</p>
    </section>
  );
}
