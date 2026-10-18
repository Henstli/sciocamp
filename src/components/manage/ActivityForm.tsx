"use client";

import { keepForm } from "@/lib/use-keep-form";
import { useActionState, useState } from "react";
import { DateInput, TimeInput } from "@/components/fields/DateTime";
import { Icon } from "@/components/Icon";
import { saveActivity, type ActivityFormState } from "@/lib/actions/activities";
import { formatDateRange } from "@/lib/periods";
import type { ActivityKind } from "@/lib/types";
import styles from "./manage.module.css";

export type ActivityFormValues = {
  slug?: string;
  kind: ActivityKind;
  title: string;
  description: string;
  location: string;
  periodId: string;
  /** „rrrr-mm-dd“ nebo prázdné */
  startsOn: string;
  endsOn: string;
  capacity: string;
  meetUrl: string;
  teacherId: string;
  grades: number[];
  projectName: string;
  milestonesDone: number;
  milestonesTotal: number;
  slots: { day: number; start: string; end: string }[];
  /** Další vyučující */
  coTeacherIds: string[];
};

const DAYS = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek"];
const KIND_OPTIONS: { value: ActivityKind; label: string; hint: string }[] = [
  { value: "kurz", label: "Kurz", hint: "Pravidelná výuka předmětu" },
  { value: "atelier", label: "Ateliér", hint: "Kratší projekt uvnitř období, často v týmech" },
  { value: "ostatni", label: "Událost", hint: "Třídnická konzultace, seminář, jednorázová akce" },
  { value: "expedice", label: "Expedice", hint: "Výjezd na 1–5 dní, jedou aspoň 2 vyučující" },
];

export function ActivityForm({
  initial,
  staff,
  canPickTeacher,
  periods,
}: {
  initial: ActivityFormValues;
  /** Kurzová období (zakládá je admin ve Správě) */
  periods: { id: string; name: string; startsOn: string; endsOn: string }[];
  /** Učitelé a admini (výběr hlavního vyučujícího pro admina, další vyučující pro všechny). */
  staff: { id: string; name: string }[];
  canPickTeacher: boolean;
}) {
  const [state, action, pending] = useActionState<ActivityFormState, FormData>(saveActivity, {});
  const [kind, setKind] = useState<ActivityKind>(initial.kind);
  // Každá hodina má stálé id, aby pole s časem po odebrání řádku nepřeskakovala.
  const [slots, setSlots] = useState(() =>
    (initial.slots.length ? initial.slots : initial.kind === "ostatni" ? [] : [{ day: 1, start: "", end: "" }]).map((s, i) => ({ ...s, uid: i })),
  );
  const [nextUid, setNextUid] = useState(100);
  const [periodId, setPeriodId] = useState(initial.periodId);
  const period = periods.find((p) => p.id === periodId) ?? null;
  const [hasProject, setHasProject] = useState(!!initial.projectName);
  const [leadId, setLeadId] = useState(initial.teacherId);
  const [coTeachers, setCoTeachers] = useState<string[]>(initial.coTeacherIds);
  const fe = state.fieldErrors ?? {};
  const editing = !!initial.slug;

  const setSlot = (i: number, patch: Partial<(typeof slots)[number]>) =>
    setSlots((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <form onSubmit={keepForm(action)} className={`card ${styles.form}`} noValidate>
      {initial.slug && <input type="hidden" name="slug" value={initial.slug} />}
      <input type="hidden" name="slots" value={JSON.stringify(slots.map(({ day, start, end }) => ({ day, start, end })))} />

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
            <select name="teacherId" value={leadId} onChange={(e) => setLeadId(e.target.value)} className={styles.input}>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Místo (nepovinné)" hint="Výuka je online. Vyplň, jen když se někde potkáte — např. kam se jede na expedici.">
          <input name="location" defaultValue={initial.location} maxLength={160} className={styles.input} placeholder="Např. Javorníky, chata pod Kohútkou" />
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
        <legend className={styles.legend}>Kdy</legend>
        <div className={styles.grid}>
          <Field
            label={kind === "ostatni" || kind === "expedice" ? "Kurzové období (nepovinné)" : "Kurzové období"}
            error={fe.periodId}
            hint={
              periods.length === 0
                ? "Admin zatím nezaložil kurzová období (Správa → Kurzová období)."
                : kind === "kurz"
                  ? "Kurz trvá celé období a na jeho konci se uzavře. V dalším období se zakládají nové kurzy."
                  : undefined
            }
          >
            <select name="periodId" value={periodId} onChange={(e) => setPeriodId(e.target.value)} className={styles.input}>
              <option value="">{periods.length === 0 ? "Žádné období" : kind === "ostatni" || kind === "expedice" ? "Mimo období" : "Vyber období…"}</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatDateRange(p.startsOn, p.endsOn)})
                </option>
              ))}
            </select>
          </Field>
          {kind !== "kurz" && (
            <>
              <Field label={kind === "atelier" || kind === "ostatni" ? "Od (nepovinné)" : "Od"} error={fe.startsOn}>
                <DateInput name="startsOn" defaultValue={initial.startsOn} ariaLabel="Začátek" />
              </Field>
              <Field label={kind === "atelier" || kind === "ostatni" ? "Do (nepovinné)" : "Do"} error={fe.endsOn}>
                <DateInput name="endsOn" defaultValue={initial.endsOn} ariaLabel="Konec" />
              </Field>
            </>
          )}
        </div>
        <span className={styles.hint}>
          {kind === "atelier"
            ? `Ateliér trvá jen část období${period ? ` (${formatDateRange(period.startsOn, period.endsOn)})` : ""}; bez data platí celé období. Student může být v jednu dobu jen v jednom ateliéru.`
            : kind === "ostatni"
              ? "Pravidelná událost (např. každý pátek): nech data prázdná a vyplň rozvrh. Jednorázová: stejné datum Od i Do."
              : kind === "expedice"
                ? "Expedice běží celé dny (obvykle po–pá). V těch dnech se ostatní výuka v rozvrhu nezobrazuje. Student může být jen na jedné expedici naráz."
                : null}
        </span>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>{kind === "expedice" ? "Další vyučující (aspoň jeden)" : "Další vyučující (nepovinné)"}</legend>
        {fe.coTeachers && (
          <p role="alert" className={styles.fieldError}>
            {fe.coTeachers}
          </p>
        )}
        <div className={styles.grades}>
          {staff
            .filter((s) => s.id !== leadId)
            .map((s) => (
              <label key={s.id} className={styles.check}>
                <input
                  type="checkbox"
                  name="coTeachers"
                  value={s.id}
                  checked={coTeachers.includes(s.id)}
                  onChange={(e) => setCoTeachers((list) => (e.target.checked ? [...list, s.id] : list.filter((x) => x !== s.id)))}
                />
                {s.name}
              </label>
            ))}
        </div>
        <span className={styles.hint}>
          {kind === "expedice"
            ? "Na expedici jedou aspoň dva vyučující. Všichni můžou třídu spravovat: Meet, studenty, nástěnku i úkoly."
            : "Spoluvyučující spravuje třídu stejně jako ty: Meet, studenty, nástěnku i úkoly."}
        </span>
      </fieldset>

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

      {kind !== "expedice" && (
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>{kind === "ostatni" ? "Rozvrh (nepovinné)" : "Rozvrh"}</legend>
        {fe.slots && (
          <p role="alert" className={styles.fieldError}>
            {fe.slots}
          </p>
        )}
        <div className={styles.slots}>
          {slots.map((s, i) => (
            <div key={s.uid} className={styles.slot}>
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
              <TimeInput
                ariaLabel={`Začátek ${i + 1}. hodiny`}
                defaultValue={s.start}
                onChange={(v) => setSlot(i, { start: v === null ? "neplatne" : v })}
              />
              <span aria-hidden="true" className={styles.slotDash}>
                –
              </span>
              <TimeInput
                ariaLabel={`Konec ${i + 1}. hodiny`}
                defaultValue={s.end}
                onChange={(v) => setSlot(i, { end: v === null ? "neplatne" : v })}
              />
              <button
                type="button"
                className={styles.remove}
                aria-label={`Odebrat ${i + 1}. hodinu`}
                onClick={() => setSlots((all) => all.filter((_, j) => j !== i))}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-outline"
          style={{ alignSelf: "flex-start", minHeight: 40 }}
          onClick={() => {
            setSlots((all) => [...all, { day: all.at(-1)?.day ?? 1, start: "", end: "", uid: nextUid }]);
            setNextUid((n) => n + 1);
          }}
        >
          + Přidat hodinu
        </button>
        <span className={styles.hint}>
          {kind === "ostatni"
            ? "Např. třídnická konzultace každý pátek 9:00–11:00. Akce bez rozvrhu s daty se ukáže jako celodenní."
            : "Hodiny se opakují každý týden po dobu trvání. Čas vyber z nabídky, nebo ho napiš (např. 930 nebo 9:30)."}
        </span>
      </fieldset>
      )}

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
