"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createProposal, type FormResult } from "@/lib/actions/proposals";
import { plural } from "@/lib/format";
import { CATEGORY_HINT, CATEGORY_LABEL, type ProposalCategory } from "@/lib/proposals";
import { keepForm } from "@/lib/use-keep-form";
import f from "@/components/manage/manage.module.css";
import styles from "@/app/(app)/navrhy/navrhy.module.css";

/** Podání návrhu: název, oblast, cíl, navržený práh (% školy pro), popis. */
export function ProposalForm({ members }: { members: number }) {
  const [percent, setPercent] = useState("30");
  const [state, action, pending] = useActionState<FormResult, FormData>(createProposal, {});
  const form = useRef<HTMLFormElement>(null);
  const fe = state.fieldErrors ?? {};
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} onSubmit={keepForm(action)} className={`card ${f.form}`} noValidate>
      <h2 className="section-title">Podat návrh</h2>
      <label className={f.field} data-invalid={!!fe.title}>
        <span className={f.label}>Název</span>
        <input name="title" maxLength={120} className={f.input} placeholder="Např. Začínat v onlinu v 10:00" />
        {fe.title && <span className={f.fieldError}>{fe.title}</span>}
      </label>
      <label className={f.field}>
        <span className={f.label}>Oblast</span>
        <select name="category" defaultValue="kurzy" className={f.input}>
          {(Object.keys(CATEGORY_LABEL) as ProposalCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
              {CATEGORY_HINT[c] ? ` (${CATEGORY_HINT[c]})` : ""}
            </option>
          ))}
        </select>
      </label>
      <fieldset className={f.field} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={f.label} style={{ marginBottom: 6 }}>
          Co se má s návrhem stát
        </legend>
        <div className={styles.goals}>
          <label className={styles.goal}>
            <input type="radio" name="goal" value="shromazdeni" defaultChecked />
            <span>
              <strong>Projednat na shromáždění</strong>
              <small>Když získá dost podpory, probere se se všemi.</small>
            </span>
          </label>
          <label className={styles.goal}>
            <input type="radio" name="goal" value="schvaleni" />
            <span>
              <strong>Předložit ke schválení</strong>
              <small>Vyučující ho schválí, nebo zamítnou se zdůvodněním.</small>
            </span>
          </label>
        </div>
        {fe.goal && <span className={f.fieldError}>{fe.goal}</span>}
      </fieldset>
      <label className={f.field} data-invalid={!!fe.needPercent}>
        <span className={f.label}>Kolik procent školy má být pro</span>
        <span className={styles.percentField}>
          <input
            name="needPercent"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            className={`${f.input} ${styles.number}`}
          />
          <span aria-hidden="true">%</span>
        </span>
        {fe.needPercent ? (
          <span className={f.fieldError}>{fe.needPercent}</span>
        ) : (
          <span className={f.hint}>{needHint(Number(percent), members)} Vyučující práh potvrdí, nebo upraví.</span>
        )}
      </label>
      <label className={f.field} data-invalid={!!fe.body}>
        <span className={f.label}>Popis</span>
        <textarea name="body" rows={5} maxLength={4000} className={f.textarea} placeholder="Co navrhuješ a proč to pomůže?" />
        {fe.body && <span className={f.fieldError}>{fe.body}</span>}
      </label>
      {(state.error || state.info) && (
        <p role="status" className={state.error ? f.formError : f.formInfo}>
          {state.error ?? state.info}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Zveřejňuji…" : "Zveřejnit návrh"}
      </button>
      <span className={f.hint} style={{ marginTop: -10 }}>
        Návrh uvidí pod tvým jménem celá škola a ty jsi automaticky pro. Kdo jak hlasuje, nikdo nevidí.
      </span>
    </form>
  );
}

/** „Ve škole je 150 lidí — 30 % znamená aspoň 45 hlasů pro.“ */
function needHint(percent: number, members: number) {
  if (!Number.isFinite(percent) || percent < 1 || percent > 100 || members < 1) return "";
  const votes = Math.ceil((percent * members) / 100);
  return `Ve škole je ${members} ${plural(members, "člověk", "lidé", "lidí")} — ${percent} % znamená aspoň ${votes} ${plural(votes, "hlas", "hlasy", "hlasů")} pro.`;
}
