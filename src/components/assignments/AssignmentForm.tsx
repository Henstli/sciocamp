"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { DueInput } from "@/components/fields/DateTime";
import { filesChanged, saveAssignment, type FormState } from "@/lib/actions/assignments";
import type { AssignmentKind, SubmissionFile } from "@/lib/types";
import { removeFile, uploadFiles } from "@/lib/upload";
import { Icon } from "../Icon";
import { WorkFiles } from "./WorkFiles";
import { TeamsField, type TeamDraft, type TeamPreset } from "./TeamsField";
import styles from "../manage/manage.module.css";
import own from "./assignment.module.css";

const BUCKET = "materialy";

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
  teamWork?: boolean;
  teamMode?: "teacher" | "students";
  teamMaxSize?: string;
  teams?: TeamDraft[];
  /** Naplánované zveřejnění „rrrr-mm-ddThh:mm“ (pražský čas), prázdné = hned / už zveřejněno */
  publishAt?: string;
  /** Úkol už studenti vidí (pak se zveřejnění neplánuje) */
  published?: boolean;
};

const KIND_OPTIONS: { value: AssignmentKind; label: string; hint: string }[] = [
  { value: "ukol", label: "Úkol", hint: "Studenti odevzdávají práci, ty ji hodnotíš" },
  { value: "material", label: "Materiál", hint: "Jen ke čtení: podklady, video, odkazy" },
];

export function AssignmentForm({
  initial,
  classes,
  topics,
  files = [],
  live,
  classStudents = {},
  teamPresets = {},
}: {
  /** Zapsaní studenti podle třídy (pro rozdělení do týmů) */
  classStudents?: Record<string, { id: string; name: string }[]>;
  /** Týmy z dřívějších týmových úkolů podle třídy */
  teamPresets?: Record<string, TeamPreset[]>;
  initial: AssignmentFormValues;
  /** Soubory, které už u úkolu jsou (při úpravě). */
  files?: SubmissionFile[];
  /** false = ukázkový režim, soubory se nenahrávají */
  live: boolean;
  /** Třídy, do kterých smí uživatel zadávat (při úpravě se třída nemění). */
  classes: { id: string; title: string }[];
  /** Existující témata podle třídy — nabídnou se v poli Téma. */
  topics: Record<string, string[]>;
}) {
  const router = useRouter();
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  // Soubory: u nového úkolu čekají ve frontě a nahrají se po založení,
  // u existujícího se nahrávají hned.
  const [queued, setQueued] = useState<File[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<AssignmentKind>(initial.kind);
  const [activity, setActivity] = useState(initial.activity || classes[0]?.id || "");
  const [teamWork, setTeamWork] = useState(!!initial.teamWork);
  const [teamMode, setTeamMode] = useState<"teacher" | "students">(initial.teamMode ?? "teacher");
  const [teams, setTeams] = useState<TeamDraft[]>(initial.teams ?? []);
  const [scheduled, setScheduled] = useState(!!initial.publishAt);
  const fe = state.fieldErrors ?? {};
  const editing = !!initial.id;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    if (!editing && queued.length > 0 && live) data.set("withFiles", "1");
    start(async () => {
      const res = (await saveAssignment({}, data)) ?? {};
      if (res.createdId) {
        const problem = await uploadFiles(BUCKET, res.createdId, queued, setUploading);
        router.push(`/ukoly/${res.createdId}?nove=1${problem ? "&soubory=chyba" : ""}`);
        return;
      }
      setState(res);
    });
  }

  async function pickFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (fileInput.current) fileInput.current.value = "";
    if (picked.length === 0) return;
    setFileMessage(null);
    if (!live) return setFileMessage("Ukázkový režim: soubory se nenahrávají.");
    if (!editing) {
      setQueued((q) => [...q, ...picked]);
      return;
    }
    const problem = await uploadFiles(BUCKET, initial.id!, picked, setUploading);
    if (problem) setFileMessage(problem);
    start(() => filesChanged());
  }

  async function dropFile(path: string) {
    setFileMessage(null);
    if (!(await removeFile(BUCKET, path))) return setFileMessage("Soubor se nepodařilo odebrat.");
    start(() => filesChanged());
  }

  return (
    <form onSubmit={onSubmit} className={`card ${styles.form}`} noValidate>
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
            <select
              name="activity"
              value={activity}
              onChange={(e) => {
                setActivity(e.target.value);
                setTeams([]); // týmy patří k žákům vybrané třídy
              }}
              className={styles.input}
            >
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

        {!initial.published && (
          <div className={styles.field} data-wide="true" style={{ gridColumn: "1 / -1" }}>
            <span className={styles.label}>Zveřejnit studentům</span>
            <div className={styles.modes} role="radiogroup" aria-label="Kdy zveřejnit">
              {(
                [
                  [false, "Hned", "Studenti ho uvidí a dostanou oznámení hned po uložení."],
                  [true, "Naplánovat", "Připrav si ho dopředu — studenti ho uvidí až ve zvolený čas."],
                ] as const
              ).map(([value, label, hint]) => (
                <label key={label} className={styles.kind} data-checked={scheduled === value}>
                  <input type="radio" name="publishMode" checked={scheduled === value} onChange={() => setScheduled(value)} className="sr-only" />
                  <span className={styles.kindLabel}>{label}</span>
                  <span className={styles.hint}>{hint}</span>
                </label>
              ))}
            </div>
            {scheduled && (
              <>
                <DueInput name="publishAt" defaultValue={initial.publishAt ?? ""} defaultTime="08:00" label="zveřejnění" />
                <span className={styles.hint}>Do té doby úkol vidíš jen ty (a další vyučující třídy) s označením „Naplánováno“.</span>
              </>
            )}
            {fe.publishAt && <span className={styles.fieldError}>{fe.publishAt}</span>}
          </div>
        )}

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
            <Field label="Termín (nepovinné)" error={fe.due} hint="Vyber v kalendáři, nebo napiš třeba 21 10 a čas 1200.">
              <DueInput name="due" defaultValue={initial.due} />
            </Field>
            <Field label="Maximum bodů (nepovinné)" error={fe.maxPoints} hint="Bez bodů hodnotíš jen splněno / nesplněno a slovně.">
              <input name="maxPoints" type="number" min={1} max={1000} step={1} defaultValue={initial.maxPoints} className={styles.input} placeholder="Např. 20" />
            </Field>
            <div className={styles.field} data-wide="true">
              <label className={styles.check}>
                <input type="checkbox" name="teamWork" value="1" checked={teamWork} onChange={(e) => setTeamWork(e.target.checked)} />
                Týmový úkol
              </label>
              <span className={styles.hint}>Tým odevzdává jednu společnou práci. Hodnotit můžeš celý tým najednou i každého zvlášť.</span>
            </div>
            {teamWork && (
              <div className={styles.teamPanel} data-wide="true" style={{ gridColumn: "1 / -1" }}>
                <input type="hidden" name="teamMode" value={teamMode} />
                <input type="hidden" name="teams" value={JSON.stringify(teams)} />
                <div className={styles.modes} role="radiogroup" aria-label="Jak vzniknou týmy">
                  {(
                    [
                      ["teacher", "Týmy rozdělím já", "Ručně, náhodně, nebo převezmeš týmy z jiného úkolu."],
                      ["students", "Studenti se rozdělí sami", "V úkolu si založí tým nebo se přidají k existujícímu."],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <label key={value} className={styles.kind} data-checked={teamMode === value}>
                      <input
                        type="radio"
                        name="teamModeChoice"
                        value={value}
                        checked={teamMode === value}
                        onChange={() => setTeamMode(value)}
                        className="sr-only"
                      />
                      <span className={styles.kindLabel}>{label}</span>
                      <span className={styles.hint}>{hint}</span>
                    </label>
                  ))}
                </div>
                {teamMode === "teacher" ? (
                  <>
                    {fe.teams && <span className={styles.fieldError}>{fe.teams}</span>}
                    <TeamsField
                      students={classStudents[activity] ?? []}
                      value={teams}
                      onChange={setTeams}
                      presets={teamPresets[activity] ?? []}
                    />
                  </>
                ) : (
                  <Field label="Největší velikost týmu (nepovinné)" error={fe.teamMaxSize} hint="Např. 3 = nejvýš trojice. Prázdné = bez omezení.">
                    <input name="teamMaxSize" type="number" min={2} max={20} defaultValue={initial.teamMaxSize} className={styles.input} placeholder="Bez omezení" />
                  </Field>
                )}
              </div>
            )}
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

        <div className={styles.field} data-wide>
          <span className={styles.label}>Soubory (nepovinné)</span>
          <WorkFiles files={files} links={[]} onRemoveFile={(p) => void dropFile(p)} />
          {queued.length > 0 && (
            <ul className={own.items}>
              {queued.map((f, i) => (
                <li key={`${f.name}-${i}`} className={own.item}>
                  <span className={own.badge} data-kind="file">
                    <Icon name="file" size={16} />
                  </span>
                  <span className={own.itemText}>
                    <span className={own.itemName}>{f.name}</span>
                    <span className={own.itemMeta}>Nahraje se po uložení</span>
                  </span>
                  <button
                    type="button"
                    className={own.remove}
                    aria-label={`Odebrat ${f.name}`}
                    onClick={() => setQueued((q) => q.filter((_, j) => j !== i))}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={fileInput}
            type="file"
            multiple
            id="soubory-ukolu"
            className="sr-only"
            onChange={(e) => void pickFiles(e.target.files)}
          />
          <label htmlFor="soubory-ukolu" className={`btn btn-outline ${own.fileButton}`} aria-disabled={!!uploading}>
            <Icon name="upload" size={18} />
            {uploading ? `Nahrávám ${uploading}…` : "Přiložit soubor"}
          </label>
          <span className={fileMessage ? styles.fieldError : styles.hint} role={fileMessage ? "alert" : undefined}>
            {fileMessage ?? "Pracovní list, prezentace, PDF… do 25 MB. Větší věci dej na Google Disk a přidej odkaz."}
          </span>
        </div>
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
        <button type="submit" className="btn btn-primary" disabled={pending || !!uploading || classes.length === 0}>
          {uploading ? "Nahrávám soubory…" : pending ? "Ukládám…" : editing ? "Uložit změny" : scheduled ? "Naplánovat" : kind === "ukol" ? "Zadat úkol" : "Přidat materiál"}
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
