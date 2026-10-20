"use client";

import { useActionState, useEffect, useRef } from "react";
import { createWish, type FormResult } from "@/lib/actions/proposals";
import { WISH_KIND_LABEL, type WishKind } from "@/lib/proposals";
import { keepForm } from "@/lib/use-keep-form";
import f from "@/components/manage/manage.module.css";
import styles from "@/app/(app)/navrhy/navrhy.module.css";

const PLACEHOLDER: Record<WishKind, string> = {
  atelier: "Např. Podcast od nápadu po vydání",
  expedice: "Např. Přechod Tater",
  kurz: "Např. Osobní finance a investování",
};

/** Přidání přání: druh, název, popis. */
export function WishForm() {
  const [state, action, pending] = useActionState<FormResult, FormData>(createWish, {});
  const form = useRef<HTMLFormElement>(null);
  const fe = state.fieldErrors ?? {};
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} onSubmit={keepForm(action)} className={`card ${f.form}`} noValidate>
      <h2 className="section-title">Přidat přání</h2>
      <fieldset className={f.field} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={f.label} style={{ marginBottom: 6 }}>
          Co by to mělo být
        </legend>
        <div className={styles.segmented}>
          {(Object.keys(WISH_KIND_LABEL) as WishKind[]).map((k) => (
            <label key={k}>
              <input type="radio" name="kind" value={k} defaultChecked={k === "atelier"} />
              {WISH_KIND_LABEL[k]}
            </label>
          ))}
        </div>
        {fe.kind && <span className={f.fieldError}>{fe.kind}</span>}
      </fieldset>
      <label className={f.field} data-invalid={!!fe.title}>
        <span className={f.label}>Název</span>
        <input name="title" maxLength={120} className={f.input} placeholder={PLACEHOLDER.atelier} />
        {fe.title && <span className={f.fieldError}>{fe.title}</span>}
      </label>
      <label className={f.field} data-invalid={!!fe.body}>
        <span className={f.label}>Popis (nepovinné)</span>
        <textarea name="body" rows={4} maxLength={2000} className={f.textarea} placeholder="Co by ses tam chtěl(a) naučit nebo zažít?" />
        {fe.body && <span className={f.fieldError}>{fe.body}</span>}
      </label>
      {(state.error || state.info) && (
        <p role="status" className={state.error ? f.formError : f.formInfo}>
          {state.error ?? state.info}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Přidávám…" : "Přidat přání"}
      </button>
      <span className={f.hint} style={{ marginTop: -10 }}>
        Kolik lidí co chce, vidí všichni — kdo přesně, nevidí nikdo. Když se přání vypíše, dostaneš oznámení.
      </span>
    </form>
  );
}
