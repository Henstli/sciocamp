"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setConsultationBlock, setConsultationRule, type ConsultResult } from "@/lib/actions/consultations";
import { formatSpan, slotEnd } from "@/lib/consultations";
import styles from "@/app/(app)/konzultace/konzultace.module.css";

export type OwnCell =
  | { k: "free" }
  | { k: "booked"; who: string; past: boolean }
  | { k: "guest"; who: string; past: boolean }
  | { k: "block" }
  | { k: "day" }
  | { k: "rule" }
  | { k: "busy"; why: string }
  | { k: "past" };

/**
 * Vyučující: přehled vlastních pátků (kdo je zapsaný, co je zrušené) s rušením
 * jednotlivých bloků nebo celého pátku, a pravidelně nedostupné bloky.
 */
export function TeacherAvailability({
  fridays,
  slots,
  cells,
  rules,
}: {
  fridays: { day: string; label: string }[];
  slots: string[];
  cells: OwnCell[][];
  rules: string[];
}) {
  const [fi, setFi] = useState(0);
  const [res, setRes] = useState<ConsultResult>({});
  const [pending, start] = useTransition();
  const [optRules, setOptRules] = useOptimistic(rules);
  const act = (fn: () => Promise<ConsultResult>, optimistic?: () => void) =>
    start(async () => {
      optimistic?.();
      const r = await fn();
      setRes(r.ok ? {} : r);
    });

  const day = fridays[fi]?.day;
  const row = cells[fi] ?? [];
  const wholeDay = row.some((c) => c.k === "day");

  return (
    <>
      <section className={`card ${styles.panel}`} aria-label="Moje pátky">
        <div className={styles.head}>
          <h2 className="section-title">Moje pátky</h2>
          {fridays.length > 0 && (
            <div className={styles.tabs} role="tablist" aria-label="Pátek">
              {fridays.map((f, i) => (
                <button key={f.day} type="button" role="tab" aria-selected={i === fi} className={styles.tab} onClick={() => setFi(i)}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {!day ? (
          <p className={styles.muted}>Teď není žádný pátek, na který by se studenti mohli zapsat.</p>
        ) : (
          <>
            <div className={styles.inline}>
              <button
                type="button"
                className={wholeDay ? "btn btn-primary" : "btn btn-outline"}
                disabled={pending}
                onClick={() => act(() => setConsultationBlock(day, null, !wholeDay))}
              >
                {wholeDay ? "Obnovit konzultace v tento pátek" : "Tento pátek nemůžu (zrušit celý)"}
              </button>
              <span className={styles.small}>Zapsané konzultace zůstanou — zruš je zvlášť v Mých konzultacích.</span>
            </div>
            <ul className={styles.slots}>
              {slots.map((slot, si) => {
                const c = row[si] ?? { k: "past" };
                const span = formatSpan(slot, slotEnd(slot));
                const toggleable = c.k === "free" || c.k === "block";
                return (
                  <li key={slot} className={styles.slotRow} data-k={c.k}>
                    <span className={styles.slotTime}>{span}</span>
                    <span className={styles.slotState}>
                      {c.k === "free" && "Volno"}
                      {c.k === "booked" && (
                        <>
                          <strong>{c.who}</strong>
                        </>
                      )}
                      {c.k === "guest" && <>Pozvánka · {c.who}</>}
                      {c.k === "block" && "Zrušeno na tento pátek"}
                      {c.k === "day" && "Celý pátek zrušený"}
                      {c.k === "rule" && "Pravidelně nemůžeš"}
                      {c.k === "busy" && c.why}
                      {c.k === "past" && "Proběhlo"}
                    </span>
                    {toggleable && (
                      <button
                        type="button"
                        className={styles.small}
                        disabled={pending}
                        onClick={() => act(() => setConsultationBlock(day, slot, c.k === "free"))}
                      >
                        {c.k === "free" ? "Zrušit tento čas" : "Obnovit"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {res.error || res.info ? (
          <p role="status" className={res.error ? styles.error : styles.info}>
            {res.error ?? res.info}
          </p>
        ) : null}
      </section>

      <section className={`card ${styles.panel}`} aria-label="Pravidelně nemůžu">
        <h2 className="section-title">Pravidelně nemůžu</h2>
        <p className={styles.muted}>Označ časy, kdy každý pátek konzultace nenabízíš. Studenti je uvidí jako nedostupné.</p>
        <div className={styles.ruleGrid}>
          {slots.map((slot) => {
            const on = optRules.includes(slot);
            return (
              <button
                key={slot}
                type="button"
                className={styles.rule}
                aria-pressed={on}
                disabled={pending}
                onClick={() =>
                  act(
                    () => setConsultationRule(slot, !on),
                    () => setOptRules(on ? optRules.filter((s) => s !== slot) : [...optRules, slot]),
                  )
                }
              >
                {formatSpan(slot, slotEnd(slot))}
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
