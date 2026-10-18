"use client";

import { keepForm } from "@/lib/use-keep-form";
import { useActionState, useState } from "react";
import { saveActivity, type ActivityFormState } from "@/lib/actions/activities";
import type { ActivityKind } from "@/lib/types";
import styles from "./manage.module.css";

export type ActivityFormValues = {
  slug?: string;
  kind: ActivityKind;
  title: string;
  description: string;
  room: string;
  capacity: string;
  meetUrl: string;
  teacherId: string;
  grades: number[];
  projectName: string;
  milestonesDone: number;
  milestonesTotal: number;
  slots: { day: number; start: string; end: string }[];
};

const DAYS = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek"];
const KIND_OPTIONS: { value: ActivityKind; label: string; hint: string }[] = [
  { value: "kurz", label: "Kurz", hint: "Pravidelná výuka předmětu" },
  { value: "atelier", label: "Ateliér", hint: "Dlouhodobý projekt, často v týmech" },
  { value: "ostatni", label: "Ostatní", hint: "Třídnická hodina, expedice, seminář …" },
];

export function ActivityForm({
  initial,
  staff,
  canPickTeacher,
}: {
  initial: ActivityFormValues;
  /** Vyučující na výběr (jen pro admina). */
  staff: { id: string; name: string }[];
  canPickTeacher: boolean;
}) {
  const [state, action, pending] = useActionState<ActivityFormState, FormData>(saveActivity, {});
  const [kind, setKind] = useState<ActivityKind>(initial.kind);
  const [slots, setSlots] = useState(initial.slots.length ? initial.slots : [{ day: 1, start: "", end: "" }]);
  const [hasProject, setHasProject] = useState(!!initial.projectName);
  const fe = state.fieldErrors ?? {};
  const editing = !!initial.slug;

  const setSlot = (i: number, patch: Partial<(typeof slots)[number]>) =>
    setSlots((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <form onSubmit={keepForm(action)} className={`card ${styles.form}`} noValidate>
      {initial.slug && <input type="hidden" name="slug" value={initial.slug} />}
      <input type="hidden" name="slots" value={JSON.stringify(slots)} />

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Typ</legend>
        <div className={styles.kinds}>
          {KIND_OPTIONS.map((k) => (
            <label key={k.value} className={styles.kind} data-checked={kind === k.value} data-kind={k.value}>
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
        <Field label="Název" error={fe.title} wide>
          <input name="title" defaultValue={initial.title} required maxLength={120} className={styles.input} placeholder="Např. Literatura ve filmu" />
        </Field>
        <Field label="Popis (nepovinné)" wide>
          <textarea
            name="description"
            defaultValue={initial.description}
            rows={3}
            className={styles.textarea}
            placeholder="O čem kurz je, pro koho je, co si přinést …"
          />
        </Field>
        {canPickTeacher && (
          <Field label="Vyučující" error={fe.teacherId}>
            <select name="teacherId" defaultValue={initial.teacherId} className={styles.input}>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Učebna / místo">
          <input name="room" defaultValue={initial.room} className={styles.input} placeholder="Např. učebna 204" />
        </Field>
        <Field label="Kapacita (nepovinné)" error={fe.capacity}>
          <input name="capacity" type="number" min={1} max={500} defaultValue={initial.capacity} className={styles.input} placeholder="Bez omezení" />
        </Field>
        <Field label="Odkaz na Google Meet (nepovinné)" error={fe.meetUrl}>
          <input name="meetUrl" type="text" inputMode="url" defaultValue={initial.meetUrl} className={styles.input} placeholder="https://meet.google.com/…" />
          <span className={styles.hint}>
            <a href="https://meet.google.com/new" target="_blank" rel="noopener noreferrer">
              Vytvořit nový Meet
            </a>{" "}
            a zkopírovat jeho adresu sem.
          </span>
        </Field>
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Pro které ročníky</legend>
        <div className={styles.grades}>
          {[1, 2, 3, 4].map((g) => (
            <label key={g} className={styles.check}>
              <input type="checkbox" name="grades" value={g} defaultChecked={initial.grades.includes(g)} />
              {g}. ročník
            </label>
          ))}
        </div>
        <span className={styles.hint}>Když nezaškrtneš nic, je aktivita pro všechny ročníky.</span>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Rozvrh</legend>
        {fe.slots && (
          <p role="alert" className={styles.fieldError}>
            {fe.slots}
          </p>
        )}
        <div className={styles.slots}>
          {slots.map((s, i) => (
            <div key={i} className={styles.slot}>
              <select
                aria-label={`Den ${i + 1}. hodiny`}
                value={s.day}
                onChange={(e) => setSlot(i, { day: Number(e.target.value) })}
                className={styles.input}
              >
                {DAYS.map((d, di) => (
                  <option key={d} value={di + 1}>
                    {d}
                  </option>
                ))}
              </select>
              <input
                type="time"
                aria-label={`Začátek ${i + 1}. hodiny`}
                value={s.start}
                step={300}
                onChange={(e) => setSlot(i, { start: e.target.value })}
                className={styles.input}
              />
              <span aria-hidden="true">–</span>
              <input
                type="time"
                aria-label={`Konec ${i + 1}. hodiny`}
                value={s.end}
                step={300}
                onChange={(e) => setSlot(i, { end: e.target.value })}
                className={styles.input}
              />
              <button
                type="button"
                className={styles.remove}
                aria-label={`Odebrat ${i + 1}. hodinu`}
                onClick={() => setSlots((all) => all.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-outline"
          style={{ alignSelf: "flex-start", minHeight: 40 }}
          onClick={() => setSlots((all) => [...all, { day: all.at(-1)?.day ?? 1, start: "", end: "" }])}
        >
          + Přidat hodinu
        </button>
        <span className={styles.hint}>Hodiny se opakují každý týden. Bez rozvrhu se aktivita v rozvrhu neukáže.</span>
      </fieldset>

      {kind === "atelier" && (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Projekt ateliéru (nepovinné)</legend>
          <label className={styles.check}>
            <input type="checkbox" checked={hasProject} onChange={(e) => setHasProject(e.target.checked)} />
            Ateliér má projekt s milníky
          </label>
          {hasProject && (
            <div className={styles.grid}>
              <Field label="Název projektu" wide>
                <input name="projectName" defaultValue={initial.projectName} className={styles.input} placeholder="Např. Týmová prezentace" />
              </Field>
              <Field label="Milníků celkem" error={fe.milestones}>
                <input name="milestonesTotal" type="number" min={1} max={20} defaultValue={initial.milestonesTotal || 5} className={styles.input} />
              </Field>
              <Field label="Z toho hotových">
                <input name="milestonesDone" type="number" min={0} max={20} defaultValue={initial.milestonesDone} className={styles.input} />
              </Field>
            </div>
          )}
        </fieldset>
      )}

      {(state.error || state.info) && (
        <p role="status" className={state.error ? styles.formError : styles.formInfo}>
          {state.error ?? state.info}
        </p>
      )}

      <div className={styles.actions}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Ukládám…" : editing ? "Uložit změny" : "Založit"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, error, wide, children }: { label: string; error?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={styles.field} data-wide={wide} data-invalid={!!error}>
      <span className={styles.label}>{label}</span>
      {children}
      {error && <span className={styles.fieldError}>{error}</span>}
    </label>
  );
}
