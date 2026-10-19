"use client";

import { keepForm } from "@/lib/use-keep-form";
import { useActionState, useState, useTransition } from "react";
import { DateInput, TimeInput } from "@/components/fields/DateTime";
import { Icon } from "@/components/Icon";
import { StaffPicker } from "./StaffPicker";
import { saveActivity, type ActivityFormState } from "@/lib/actions/activities";
import { formatDateRange, formatDateRangeWithYear, currentSchoolYear } from "@/lib/periods";
import { formatDue } from "@/lib/time";
import { leaveRound } from "@/lib/actions/rounds";
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
  /** Ateliér a expedice: připraveno k vyhlášení, nebo už zařazeno do zápisového kola */
  announceReady: boolean;
  /** Událost pro všechny studenty / všechny vyučující (doplňují se i noví) */
  forAllStudents: boolean;
  forAllStaff: boolean;
  /** Termín od admina (ateliér, expedice), jinak "" */
  termId: string;
  round: { opensAt: string; closesAt: string; started: boolean } | null;
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
  terms = [],
}: {
  /** Termíny ateliérů a expedic od admina (jen ty, které ještě neskončily) */
  terms?: { id: string; kind: "atelier" | "expedice"; name: string | null; startsOn: string; endsOn: string }[];
  initial: ActivityFormValues;
  /** Kurzová období (zakládá je admin ve Správě) */
  periods: { id: string; name: string; startsOn: string; endsOn: string; enrollOpensAt?: string | null; enrollClosesAt?: string | null }[];
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
  const [hasProject, setHasProject] = useState(!!initial.projectName);
  const [leadId, setLeadId] = useState(initial.teacherId);
  const [coTeachers, setCoTeachers] = useState<string[]>(initial.coTeacherIds);
  const [forAllStaff, setForAllStaff] = useState(initial.forAllStaff);
  // Data události; „Celý školní rok“ je přepíše na 1. 9. – 30. 6.
  const [dates, setDates] = useState({ from: initial.startsOn, to: initial.endsOn, version: 0 });
  const schoolYear = currentSchoolYear();
  const fe = state.fieldErrors ?? {};
  const editing = !!initial.slug;
  // Ateliér a expedice: termín ze seznamu od admina (vlastní data jen admin nebo u starších záznamů).
  const kindTerms = terms.filter((t) => t.kind === kind);
  const usesTerms = (kind === "atelier" || kind === "expedice") && kindTerms.length > 0;
  const [pickedTerm, setTermId] = useState(initial.termId);
  // Po přepnutí ateliér ↔ expedice neplatí termín druhého druhu.
  const termId = kindTerms.some((t) => t.id === pickedTerm) ? pickedTerm : "";
  // Ateliér / expedice se vybírá jen z termínů; vlastní data zůstanou jen u starších záznamů.
  const allowCustomDates = !initial.termId && !!initial.startsOn;

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
          {usesTerms && (
            <Field
              label={kind === "expedice" ? "Týden expedice" : "Termín ateliéru"}
              error={fe.termId}
              hint="Termíny předem zadává admin. Data se doplní sama a posunou se, když admin termín změní."
              wide
            >
              <select name="termId" value={termId} onChange={(e) => setTermId(e.target.value)} className={styles.input}>
                <option value="">
                  {allowCustomDates ? "Původní vlastní data" : "Vyber termín…"}
                </option>
                {kindTerms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {formatDateRangeWithYear(t.startsOn, t.endsOn)}
                    {t.name ? ` · ${t.name}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {kind !== "kurz" && <input type="hidden" name="periodId" value={initial.periodId} />}
          {kind === "kurz" && (
          <Field
            label="Kurzové období"
            error={fe.periodId}
            hint={
              periods.length === 0
                ? "Admin zatím nezaložil kurzová období (Správa → Kurzová období)."
                : "Kurz trvá celé období a na jeho konci se uzavře. V dalším období se zakládají nové kurzy."
            }
          >
            <select name="periodId" value={periodId} onChange={(e) => setPeriodId(e.target.value)} className={styles.input}>
              <option value="">{periods.length === 0 ? "Žádné období" : "Vyber období…"}</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatDateRange(p.startsOn, p.endsOn)})
                </option>
              ))}
            </select>
          </Field>
          )}
          {kind !== "kurz" && !(usesTerms && (termId || !allowCustomDates)) && (
            <>
              <Field label={kind === "ostatni" ? "Od (nepovinné)" : "Od"} error={fe.startsOn}>
                <DateInput key={`od${dates.version}`} name="startsOn" defaultValue={dates.from} ariaLabel="Začátek" />
              </Field>
              <Field label={kind === "ostatni" ? "Do (nepovinné)" : "Do"} error={fe.endsOn}>
                <DateInput key={`do${dates.version}`} name="endsOn" defaultValue={dates.to} ariaLabel="Konec" />
              </Field>
            </>
          )}
        </div>
        {kind === "ostatni" && (
          <div className={styles.quickRow}>
            <span className={styles.quickLabel}>Rychle:</span>
            <button
              type="button"
              className={styles.quickChip}
              title={`Nastaví ${formatDateRangeWithYear(schoolYear.from, schoolYear.to)}`}
              onClick={() => setDates((d) => ({ ...schoolYear, version: d.version + 1 }))}
            >
              <Icon name="calendar" size={14} />
              Celý školní rok
            </button>
          </div>
        )}
        <span className={styles.hint}>
          {(kind === "atelier" || kind === "expedice") && kindTerms.length === 0
            ? "Admin zatím nezadal termíny (Správa → Kurzová období → Termíny ateliérů a expedic), proto vyplň data ručně. "
            : null}
          {usesTerms && (termId || !allowCustomDates)
            ? kind === "atelier"
              ? "Souběžné ateliéry ve stejném termínu si student vybírá mezi sebou — může být jen v jednom."
              : "V týdnu expedic se ostatní výuka v rozvrhu nezobrazuje. Student může být jen na jedné expedici naráz."
            : kind === "atelier"
            ? "Vyplň, od kdy do kdy ateliér běží. Student může být v jednu dobu jen v jednom ateliéru."
            : kind === "ostatni"
              ? "Pravidelná událost (např. každý pátek): vyplň rozvrh a klikni na „Celý školní rok“. Jednorázová: stejné datum Od i Do."
              : kind === "expedice"
                ? "Expedice běží celé dny (obvykle po–pá). V těch dnech se ostatní výuka v rozvrhu nezobrazuje. Student může být jen na jedné expedici naráz."
                : null}
        </span>
      </fieldset>

      {(kind === "atelier" || kind === "expedice") && (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Zápis studentů</legend>
          {initial.round ? (
            <RoundStatus slug={initial.slug!} round={initial.round} />
          ) : (
            <>
              <label className={styles.check}>
                <input type="checkbox" name="announceReady" value="1" defaultChecked={initial.announceReady} />
                <span>
                  <strong>Připraveno k vyhlášení zápisu</strong> — {kind === "expedice" ? "expedici" : "ateliér"} pak kdokoli z učitelů
                  vyhlásí v Zápisech hromadně spolu s ostatními připravenými, s jedním společným termínem.
                </span>
              </label>
              <span className={styles.hint}>
                Když už zápis {kind === "expedice" ? "na expedice" : "do ateliérů"} vyhlášený je, přidáš ho do něj v Zápisech. Bez
                zápisu studenty zapisuješ sám v části Studenti.
              </span>
            </>
          )}
        </fieldset>
      )}
      {kind === "kurz" && (
        <p className={styles.hint}>
          Kurz uvidí studenti v Zápisech, až admin zveřejní kurzové období. Termín zápisu do kurzů nastavuje admin. V Moje
          třídy pak dej vědět „Mám hotovo“.
        </p>
      )}

      {kind === "ostatni" && (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Kdo se účastní</legend>
          <label className={styles.check}>
            <input type="checkbox" name="forAllStudents" value="1" defaultChecked={initial.forAllStudents} />
            <span>
              <strong>Všichni studenti</strong> — zapíšou se sami, i ti, které admin přidá později (s ohledem na ročníky níže).
            </span>
          </label>
          <label className={styles.check}>
            <input type="checkbox" name="forAllStaff" value="1" checked={forAllStaff} onChange={(e) => setForAllStaff(e.target.checked)} />
            <span>
              <strong>Všichni učitelé a admini</strong> — uvidí událost v rozvrhu jako vyučující, i nově přidaní.
            </span>
          </label>
          <span className={styles.hint}>Jednotlivé studenty můžeš zapsat i ručně po uložení v části Studenti.</span>
        </fieldset>
      )}

      {!(kind === "ostatni" && forAllStaff) && (
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>{kind === "expedice" ? "Další vyučující (aspoň jeden)" : "Další vyučující (nepovinné)"}</legend>
        {fe.coTeachers && (
          <p role="alert" className={styles.fieldError}>
            {fe.coTeachers}
          </p>
        )}
        <StaffPicker name="coTeachers" staff={staff} selected={coTeachers} onChange={setCoTeachers} exclude={leadId} />
        <span className={styles.hint}>
          {kind === "expedice"
            ? "Na expedici jedou aspoň dva vyučující. Všichni můžou třídu spravovat: Meet, studenty, nástěnku i úkoly."
            : "Spoluvyučující spravuje třídu stejně jako ty: Meet, studenty, nástěnku i úkoly."}
        </span>
      </fieldset>
      )}

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

/** Ateliér / expedice už je v zápisu: termín a případné stažení (jen před otevřením). */
function RoundStatus({ slug, round }: { slug: string; round: NonNullable<ActivityFormValues["round"]> }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; info?: string }>({});
  return (
    <div className={styles.roundStatus}>
      <p>
        <strong>Zařazeno do zápisu</strong> {formatDue(round.opensAt)} – {formatDue(round.closesAt)}.{" "}
        {round.started ? "Zápis už běží, studenti se zapisují sami." : "Studenti ho uvidí v Zápisech a v termínu se zapíšou."}
      </p>
      {!round.started && (
        <button type="button" className="btn btn-outline" disabled={pending} onClick={() => start(async () => setMsg(await leaveRound(slug)))}>
          {pending ? "Stahuji…" : "Stáhnout ze zápisu"}
        </button>
      )}
      {(msg.error || msg.info) && (
        <span role="status" className={msg.error ? styles.fieldError : styles.hint}>
          {msg.error ?? msg.info}
        </span>
      )}
    </div>
  );
}
