"use client";

import { keepForm } from "@/lib/use-keep-form";
import { useActionState, useState } from "react";
import { DueInput } from "@/components/fields/DateTime";
import { saveAssignment, type FormState } from "@/lib/actions/assignments";
import type { AssignmentKind } from "@/lib/types";
import styles from "../manage/manage.module.css";

export type AssignmentFormValues = {
  id?: string;
  activity: string;
  kind: AssignmentKind;
  title: string;
  instructions: string;
  topic: string;
  /** „2026-10-21T23:59“ v pražském čase, nebo prázdné */
  due: string;
  maxPoints: string;
  /** Jeden odkaz na řádek, volitelně „Název | https://…“ */
  links: string;
};

const KIND_OPTIONS: { value: AssignmentKind; label: string; hint: string }[] = [
  { value: "ukol", label: "Úkol", hint: "Studenti odevzdávají práci, ty ji hodnotíš" },
  { value: "material", label: "Materiál", hint: "Jen ke čtení: podklady, video, odkazy" },
];

export function AssignmentForm({
  initial,
  classes,
  topics,
}: {
  initial: AssignmentFormValues;
  /** Třídy, do kterých smí uživatel zadávat (při úpravě se třída nemění). */
  classes: { id: string; title: string }[];
  /** Existující témata podle třídy — nabídnou se v poli Téma. */
  topics: Record<string, string[]>;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAssignment, {});
  const [kind, setKind] = useState<AssignmentKind>(initial.kind);
  const [activity, setActivity] = useState(initial.activity || classes[0]?.id || "");
  const fe = state.fieldErrors ?? {};
  const editing = !!initial.id;

  return (
    <form onSubmit={keepForm(action)} className={`card ${styles.form}`} noValidate>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Co zadáváš</legend>
        <div className={styles.kinds}>
          {KIND_OPTIONS.map((k) => (
            <label key={k.value} className={styles.kind} data-checked={kind === k.value}>
              <input
                type="radio"
                name="kind"
                value={k.value}
                checked={kind === k.value}
                onChange={() => setKind(k.value)}
                className="sr-only"
              />
              <span className={styles.kindLabel}>{k.label}</span>
              <span className={styles.hint}>{k.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.grid}>
        {editing ? (
          <input type="hidden" name="activity" value={activity} />
        ) : (
          <Field label="Třída" wide>
            <select name="activity" value={activity} onChange={(e) => setActivity(e.target.value)} className={styles.input}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Název" error={fe.title} wide>
          <input
            name="title"
            defaultValue={initial.title}
            maxLength={200}
            required
            className={styles.input}
            placeholder={kind === "ukol" ? "Např. Rozbor úvodní scény" : "Např. Prezentace z hodiny"}
          />
        </Field>

        <Field label={kind === "ukol" ? "Zadání" : "Popis (nepovinné)"} wide>
          <textarea
            name="instructions"
            defaultValue={initial.instructions}
            rows={6}
            className={styles.textarea}
            placeholder={kind === "ukol" ? "Co mají studenti udělat, co odevzdat a podle čeho budeš hodnotit." : "K čemu materiál je."}
          />
        </Field>

        <Field label="Téma (nepovinné)" hint="Úkoly se stejným tématem se v třídě zobrazí pohromadě.">
          <input name="topic" defaultValue={initial.topic} list="topics" maxLength={120} className={styles.input} placeholder="Např. Téma 1 · Struktura" />
          <datalist id="topics">
            {(topics[activity] ?? []).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>

        {kind === "ukol" && (
          <>
            <Field label="Termín (nepovinné)" error={fe.due} hint="Datum jako 21. 10. 2026, čas ve 24h formátu.">
              <DueInput name="due" defaultValue={initial.due} />
            </Field>
            <Field label="Maximum bodů (nepovinné)" error={fe.maxPoints} hint="Bez bodů hodnotíš jen splněno / nesplněno a slovně.">
              <input name="maxPoints" type="number" min={1} max={1000} step={1} defaultValue={initial.maxPoints} className={styles.input} placeholder="Např. 20" />
            </Field>
          </>
        )}

        <Field
          label="Odkazy (nepovinné)"
          error={fe.links}
          hint="Jeden na řádek — Google dokumenty, videa, weby. Vlastní název: „Rubrika | https://…“."
          wide
        >
          <textarea name="links" defaultValue={initial.links} rows={3} className={styles.textarea} placeholder="https://docs.google.com/…" />
        </Field>
      </div>

      {state.error && (
        <p role="alert" className={styles.formError}>
          {state.error}
        </p>
      )}
      {state.info && (
        <p role="status" className={styles.formInfo}>
          {state.info}
        </p>
      )}

      <div className={styles.actions}>
        <button type="submit" className="btn btn-primary" disabled={pending || classes.length === 0}>
          {pending ? "Ukládám…" : editing ? "Uložit změny" : kind === "ukol" ? "Zadat úkol" : "Přidat materiál"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  hint,
  wide,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.field} data-wide={wide} data-invalid={!!error}>
      <span className={styles.label}>{label}</span>
      {children}
      {hint && !error && <span className={styles.hint}>{hint}</span>}
      {error && <span className={styles.fieldError}>{error}</span>}
    </label>
  );
}
