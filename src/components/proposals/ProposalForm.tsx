"use client";

import { useActionState, useEffect, useRef } from "react";
import { createProposal, type FormResult } from "@/lib/actions/proposals";
import { CATEGORY_LABEL, type ProposalCategory } from "@/lib/proposals";
import { keepForm } from "@/lib/use-keep-form";
import f from "@/components/manage/manage.module.css";
import styles from "@/app/(app)/navrhy/navrhy.module.css";

/** Podání návrhu: název, oblast, cíl, navržený počet podporovatelů, popis. */
export function ProposalForm() {
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
        <input name="title" maxLength={120} className={f.input} placeholder="Např. Mikrovlnka do druhého patra" />
        {fe.title && <span className={f.fieldError}>{fe.title}</span>}
      </label>
      <label className={f.field}>
        <span className={f.label}>Oblast</span>
        <select name="category" defaultValue="vyuka" className={f.input}>
          {(Object.keys(CATEGORY_LABEL) as ProposalCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
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
      <label className={f.field} data-invalid={!!fe.need}>
        <span className={f.label}>Kolik lidí ho má podpořit</span>
        <input name="need" type="number" inputMode="numeric" min={1} max={500} defaultValue={10} className={`${f.input} ${styles.number}`} />
        {fe.need ? (
          <span className={f.fieldError}>{fe.need}</span>
        ) : (
          <span className={f.hint}>Vyučující počet potvrdí, nebo upraví.</span>
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
        Návrh uvidí pod tvým jménem celá škola. Ty ho podporuješ automaticky.
      </span>
    </form>
  );
}
