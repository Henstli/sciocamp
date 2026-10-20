"use client";

// Závěrečné hodnocení třídy (vyučující a admin): u každého studenta splněno /
// nesplněno a slovní hodnocení, vedle přehled jeho úkolů v této třídě.
// Studenti hodnocení uvidí, až vyučující třídu uzavře.

import { useState, useTransition } from "react";
import { Avatar, profileHref } from "../PageHeader";
import { Icon } from "../Icon";
import { closeActivity, reopenActivity, saveFinalReviews } from "@/lib/actions/final-reviews";
import { FINAL_LABEL, type FinalResult } from "@/lib/final-reviews";
import type { Person } from "./people";
import styles from "./final.module.css";

export type FinalRow = {
  student: Person;
  result: FinalResult | null;
  feedback: string;
  /** „Hodnotila Anežka Jakubcová · 20. 10.“ */
  stamp: string | null;
  tasks: { handed: number; due: number; onTime: string; points: string; missing: number } | null;
};

export type FinalView = {
  rows: FinalRow[];
  closed: string | null;
  /** Aktivita už skončila (jinak jen upozornění, že se hodnotí předčasně) */
  ended: boolean;
};

type Draft = { result: FinalResult | null; feedback: string; saved: { result: FinalResult | null; feedback: string } };

export function FinalReviews({ view, slug, live }: { view: FinalView; slug: string; live: boolean }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      view.rows.map((r) => [r.student.id, { result: r.result, feedback: r.feedback, saved: { result: r.result, feedback: r.feedback } }]),
    ),
  );
  const [closed, setClosed] = useState(view.closed);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [saving, setSaving] = useState<string | null>(null);

  const rated = view.rows.filter((r) => drafts[r.student.id].saved.result).length;
  const passed = view.rows.filter((r) => drafts[r.student.id].saved.result === "splneno").length;
  const failed = rated - passed;
  const missing = view.rows.length - rated;
  const demoNote = "Ukázkový režim: hodnocení se neukládá, jen si ho tu vyzkoušíš.";

  const set = (id: string, patch: Partial<Omit<Draft, "saved">>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const save = (ids: string[], result?: FinalResult) =>
    start(async () => {
      setMsg(null);
      setSaving(ids.length === 1 ? ids[0] : "vse");
      const items = ids.map((id) => ({
        studentId: id,
        result: (result ?? drafts[id].result) as FinalResult,
        feedback: drafts[id].feedback,
      }));
      const res = await saveFinalReviews(slug, items);
      setSaving(null);
      if (res.error) return setMsg({ tone: "error", text: res.error });
      setDrafts((d) => {
        const next = { ...d };
        for (const i of items) next[i.studentId] = { result: i.result, feedback: i.feedback, saved: { result: i.result, feedback: i.feedback } };
        return next;
      });
      if (res.demo || !live) setMsg({ tone: "info", text: demoNote });
    });

  const close = () =>
    start(async () => {
      setMsg(null);
      const res = await closeActivity(slug);
      setConfirm(false);
      if (res.error) return setMsg({ tone: "error", text: res.error });
      setClosed(res.demo ? "právě teď (ukázka)" : "právě teď");
      if (res.demo) setMsg({ tone: "info", text: demoNote });
    });

  const reopen = () =>
    start(async () => {
      setMsg(null);
      const res = await reopenActivity(slug);
      if (res.error) return setMsg({ tone: "error", text: res.error });
      setClosed(null);
      if (res.demo) setMsg({ tone: "info", text: demoNote });
    });

  const unrated = view.rows.filter((r) => !drafts[r.student.id].saved.result).map((r) => r.student.id);

  return (
    <div className={styles.wrap}>
      <section className={`card ${styles.head}`} aria-label="Stav hodnocení">
        <div className={styles.headText}>
          <h2 className={styles.title}>Závěrečné hodnocení</h2>
          <p className={styles.note}>
            {closed
              ? "Třída je uzavřená — studenti své hodnocení vidí. Když ho teď změníš, přijde jim oznámení."
              : "Každému studentovi dej splněno, nebo nesplněno a pár vět. Studenti hodnocení uvidí, až třídu uzavřeš."}
            {!closed && !view.ended && " Aktivita ještě běží — hodnotit můžeš už teď."}
          </p>
          <div className={styles.progress} role="img" aria-label={`Ohodnoceno ${rated} z ${view.rows.length}`}>
            <span data-k="ok" style={{ flexGrow: passed }} />
            <span data-k="late" style={{ flexGrow: failed }} />
            <span data-k="none" style={{ flexGrow: missing }} />
          </div>
          <div className={styles.counts}>
            <span>
              Ohodnoceno <b>{rated}</b> z {view.rows.length}
            </span>
            <span className={styles.ok}>Splněno {passed}</span>
            <span className={styles.late}>Nesplněno {failed}</span>
          </div>
        </div>
        <div className={styles.headActions}>
          {closed ? (
            <>
              <span className={`chip chip-ok ${styles.closedChip}`}>
                <Icon name="tick" size={14} strokeWidth={3} />
                Uzavřeno {closed}
              </span>
              <button type="button" className="btn btn-outline-primary" onClick={reopen} disabled={pending}>
                Znovu otevřít
              </button>
            </>
          ) : confirm ? (
            <div className={styles.confirm} role="group" aria-label="Potvrdit uzavření">
              <span>Studentům přijde oznámení s hodnocením. Uzavřít?</span>
              <div className={styles.confirmBtns}>
                <button type="button" className="btn btn-primary" onClick={close} disabled={pending}>
                  Ano, uzavřít a zveřejnit
                </button>
                <button type="button" className="btn btn-outline-primary" onClick={() => setConfirm(false)} disabled={pending}>
                  Zrušit
                </button>
              </div>
            </div>
          ) : (
            <>
              {unrated.length > 0 && (
                <button type="button" className="btn btn-outline-primary" onClick={() => save(unrated, "splneno")} disabled={pending}>
                  Zbylým {unrated.length} splněno
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setConfirm(true)}
                disabled={pending || missing > 0 || view.rows.length === 0}
                title={missing > 0 ? `Ještě chybí hodnocení u ${missing} ${missing === 1 ? "studenta" : "studentů"}.` : undefined}
              >
                Uzavřít a zveřejnit
              </button>
            </>
          )}
        </div>
        {msg && (
          <p role={msg.tone === "error" ? "alert" : "status"} className={styles.msg} data-tone={msg.tone}>
            {msg.text}
          </p>
        )}
      </section>

      {view.rows.length === 0 ? (
        <div className={`card ${styles.empty}`}>Ve třídě nikdo není zapsaný.</div>
      ) : (
        <ul className={styles.list}>
          {view.rows.map((r) => {
            const d = drafts[r.student.id];
            const dirty = d.result !== d.saved.result || d.feedback.trim() !== d.saved.feedback.trim();
            const name = `vysledek-${r.student.id}`;
            return (
              <li key={r.student.id} className={`card ${styles.row}`} data-result={d.saved.result ?? "none"}>
                <div className={styles.who}>
                  <Avatar initials={r.student.initials} size={40} href={profileHref(r.student.id)} title={r.student.name} />
                  <div className={styles.whoText}>
                    <span className={styles.name}>{r.student.name}</span>
                    {r.tasks ? (
                      <span className={styles.tasks}>
                        Úkoly: odevzdáno {r.tasks.handed} z {r.tasks.due} · včas {r.tasks.onTime} · body {r.tasks.points}
                        {r.tasks.missing > 0 && <b> · chybí {r.tasks.missing}</b>}
                      </span>
                    ) : (
                      <span className={styles.tasks}>Ve třídě zatím nebyl úkol s termínem.</span>
                    )}
                  </div>
                </div>
                <div className={styles.choice} role="radiogroup" aria-label={`Výsledek: ${r.student.name}`}>
                  {(["splneno", "nesplneno"] as const).map((v) => (
                    <label key={v} data-v={v}>
                      <input
                        type="radio"
                        name={name}
                        checked={d.result === v}
                        onChange={() => set(r.student.id, { result: v })}
                      />
                      <Icon name={v === "splneno" ? "tick" : "close"} size={15} strokeWidth={2.6} />
                      {FINAL_LABEL[v]}
                    </label>
                  ))}
                </div>
                <label className={styles.feedback}>
                  <span className="sr-only">Slovní hodnocení: {r.student.name}</span>
                  <textarea
                    rows={2}
                    maxLength={4000}
                    value={d.feedback}
                    placeholder="Slovní hodnocení — co se povedlo, na čem zapracovat…"
                    onChange={(e) => set(r.student.id, { feedback: e.target.value })}
                  />
                </label>
                <div className={styles.rowFoot}>
                  <span className={styles.stamp}>
                    {dirty ? <span className={styles.unsaved}>Neuložené změny</span> : r.stamp && d.saved.result ? r.stamp : d.saved.result ? "Uloženo" : "Zatím bez hodnocení"}
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={pending || !dirty || !d.result}
                    onClick={() => save([r.student.id])}
                  >
                    {saving === r.student.id ? "Ukládám…" : "Uložit"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
