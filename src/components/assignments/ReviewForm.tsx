"use client";

import { keepForm } from "@/lib/use-keep-form";
import { useActionState, useState, useTransition } from "react";
import { clearReview, reviewWork, type FormState } from "@/lib/actions/assignments";
import type { Review, ReviewResult } from "@/lib/types";
import styles from "./assignment.module.css";

const OPTIONS: { value: ReviewResult; label: string; hint: string }[] = [
  { value: "splneno", label: "Splněno", hint: "Práce je hotová" },
  { value: "vraceno", label: "Vrátit k doplnění", hint: "Student doplní a odevzdá znovu" },
  { value: "nesplneno", label: "Nesplněno", hint: "Uzavřít jako nesplněné" },
];

/** Hodnocení práce: výsledek, body z maxima, slovní hodnocení a požadavek při vrácení. */
export function ReviewForm({
  assignmentId,
  studentId,
  studentName,
  maxPoints,
  current,
  team = null,
}: {
  /** Týmový úkol: hodnocení dostane celý tým */
  team?: { name: string; members: string[] } | null;
  assignmentId: string;
  studentId: string;
  studentName: string;
  maxPoints: number | null;
  current: Review | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(reviewWork, {});
  const [result, setResult] = useState<ReviewResult>(current?.result ?? "splneno");
  const [clearing, startClear] = useTransition();
  const [clearError, setClearError] = useState<string>();
  const fe = state.fieldErrors ?? {};

  return (
    <form onSubmit={keepForm(action)} className={styles.reviewForm} noValidate>
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="studentId" value={studentId} />
      {team && (
        <p className={styles.teamNote}>
          Týmový úkol: hodnocení dostane celý <strong>{team.name}</strong> ({team.members.join(", ")}).
        </p>
      )}

      <fieldset className={styles.fieldset}>
        <legend className={styles.h3}>Hodnocení</legend>
        <div className={styles.results}>
          {OPTIONS.map((o) => (
            <label key={o.value} className={styles.result} data-checked={result === o.value} data-result={o.value}>
              <input
                type="radio"
                name="result"
                value={o.value}
                checked={result === o.value}
                onChange={() => setResult(o.value)}
                className="sr-only"
              />
              <span className={styles.resultLabel}>{o.label}</span>
              <span className={styles.small}>{o.hint}</span>
            </label>
          ))}
        </div>
        {fe.result && <span className={styles.fieldError}>{fe.result}</span>}
      </fieldset>

      {maxPoints !== null && (
        <label className={styles.field}>
          Body
          <span className={styles.pointsInput}>
            <input
              name="points"
              type="number"
              min={0}
              max={maxPoints}
              step={1}
              defaultValue={current?.points ?? ""}
              className={styles.input}
              aria-describedby="points-max"
            />
            <span id="points-max">/ {maxPoints}</span>
          </span>
          {fe.points && <span className={styles.fieldError}>{fe.points}</span>}
        </label>
      )}

      {result === "vraceno" && (
        <label className={styles.field}>
          Co má student doplnit
          <textarea name="request" rows={3} defaultValue={current?.request ?? ""} className={styles.textarea} placeholder="Např. Doplň zdroje a závěr." />
          {fe.request && <span className={styles.fieldError}>{fe.request}</span>}
        </label>
      )}

      <label className={styles.field}>
        Slovní hodnocení (nepovinné)
        <textarea name="feedback" rows={4} defaultValue={current?.feedback ?? ""} className={styles.textarea} placeholder="Co se povedlo a co příště jinak." />
      </label>

      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
      {state.info && (
        <p role="status" className={styles.info}>
          {state.info}
        </p>
      )}

      <div className={styles.actionsRow}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending
            ? "Ukládám…"
            : result === "vraceno"
              ? team
                ? `Vrátit týmu ${team.name}`
                : `Vrátit: ${studentName.split(" ")[0]}`
              : team
                ? "Uložit hodnocení týmu"
                : "Uložit hodnocení"}
        </button>
        {current && (
          <button
            type="button"
            className="btn btn-outline"
            disabled={clearing}
            onClick={() =>
              startClear(async () => {
                const res = await clearReview(assignmentId, studentId);
                setClearError(res.error);
              })
            }
          >
            Zrušit hodnocení
          </button>
        )}
      </div>
      {clearError && (
        <p role="alert" className={styles.error}>
          {clearError}
        </p>
      )}
    </form>
  );
}
