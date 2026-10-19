"use client";

import { useActionState, useState, useTransition } from "react";
import { DateInput, DueInput } from "@/components/fields/DateTime";
import { Icon } from "@/components/Icon";
import { deletePeriod, publishPeriod, savePeriod, type PeriodState } from "@/lib/actions/periods";
import { plural } from "@/lib/format";
import { formatDateRangeWithYear } from "@/lib/periods";
import { formatDue } from "@/lib/time";
import { keepForm } from "@/lib/use-keep-form";
import styles from "./admin.module.css";

export type PeriodRow = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  /** Termín zápisu pro formulář (pražský čas „rrrr-mm-ddThh:mm“) */
  enrollOpens: string;
  enrollCloses: string;
  enrollOpensAt: string | null;
  enrollClosesAt: string | null;
  published: boolean;
  ended: boolean;
  /** Nejbližší příští období (připravenost a zveřejnění se ukazuje jen u něj) */
  nearest: boolean;
  current: boolean;
  activities: number;
  courses: number;
  /** Kurzy, které studenti ještě nevidí */
  drafts: number;
  teachers: { id: string; name: string; courses: number; ready: boolean }[];
};

/**
 * Kurzová období (4 za rok): admin je zakládá, učitelé do nich zadávají kurzy
 * a potvrdí „Mám hotovo“. Admin pak kurzy zveřejní v Zápisech s termínem zápisu.
 */
export function PeriodManager({
  periods,
  ready = { ateliers: 0, expeditions: 0 },
}: {
  periods: PeriodRow[];
  /** Připravené ateliéry a expedice, které jde vyhlásit spolu s kurzy */
  ready?: { ateliers: number; expeditions: number };
}) {
  const [editing, setEditing] = useState<PeriodRow | "new" | null>(periods.length === 0 ? "new" : null);
  const [msg, setMsg] = useState<PeriodState>({});
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section aria-label="Kurzová období" className={`card ${styles.table} ${styles.periods}`}>
      <div className={styles.toolbar}>
        <div>
          <h2 className="section-title">Kurzová období</h2>
          <p className={styles.inviteNote}>
            Za rok jsou 4 období, 2 v každém pololetí. Učitelé do nového období zadají kurzy a potvrdí „Mám hotovo“. Pak
            nastavíš termín zápisu a kurzy zveřejníš v Zápisech.
          </p>
        </div>
        {editing === null && (
          <button type="button" className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setEditing("new")}>
            + Nové období
          </button>
        )}
      </div>

      {editing !== null && (
        <PeriodForm
          key={editing === "new" ? "new" : editing.id}
          period={editing === "new" ? null : editing}
          suggestedName={`Kurzové období ${periods.length + 1}`}
          onClose={() => setEditing(null)}
        />
      )}

      {periods.map((p) => (
        <div key={p.id} className={styles.periodRow}>
          <div className={styles.periodHead}>
            <div className={styles.courseMain}>
              <div className={styles.name}>
                {p.name}{" "}
                {p.current ? (
                  <span className="chip chip-ok">Právě běží</span>
                ) : p.ended ? (
                  <span className="chip">Proběhlo</span>
                ) : p.published ? (
                  <span className="chip chip-primary">Zveřejněno v Zápisech</span>
                ) : (
                  p.nearest ? (
                    <span className="chip chip-wait">Příprava</span>
                  ) : (
                    <span className="chip chip-info">Naplánováno</span>
                  )
                )}
              </div>
              <div className={styles.email}>
                {formatDateRangeWithYear(p.startsOn, p.endsOn)} · {p.activities}{" "}
                {plural(p.activities, "aktivita", "aktivity", "aktivit")}
                {p.drafts > 0 && ` · ${p.drafts} ${plural(p.drafts, "nezveřejněný kurz", "nezveřejněné kurzy", "nezveřejněných kurzů")}`}
              </div>
              {!p.ended && (
                <div className={styles.email}>
                  <Icon name="clock" size={14} />{" "}
                  {p.enrollOpensAt && p.enrollClosesAt
                    ? `Zápis ${formatDue(p.enrollOpensAt)} – ${formatDue(p.enrollClosesAt)}`
                    : "Termín zápisu zatím není nastavený"}
                </div>
              )}
            </div>
            <button type="button" className="btn btn-outline" style={{ minHeight: 40 }} onClick={() => setEditing(p)}>
              Upravit
            </button>
            {confirm === `del-${p.id}` ? (
              <button
                type="button"
                className="btn btn-outline"
                style={{ minHeight: 40, color: "var(--late)", borderColor: "#e7b4b4" }}
                disabled={pending}
                onClick={() => start(async () => setMsg(await deletePeriod(p.id)))}
              >
                Opravdu smazat?
              </button>
            ) : (
              <button type="button" className="btn btn-outline" style={{ minHeight: 40 }} onClick={() => setConfirm(`del-${p.id}`)}>
                Smazat
              </button>
            )}
          </div>

          {!p.ended && (p.nearest || p.published) && (!p.published || p.drafts > 0) && <Readiness period={p} />}

          {!p.ended && (p.nearest || p.published) && (!p.published || p.drafts > 0) && (
            <PublishControl
              period={p}
              ready={ready}
              confirming={confirm === `pub-${p.id}`}
              pending={pending}
              onAsk={() => setConfirm(`pub-${p.id}`)}
              onCancel={() => setConfirm(null)}
              onPublish={(withAteliers, withExpeditions) =>
                start(async () => {
                  setMsg(await publishPeriod(p.id, withAteliers, withExpeditions));
                  setConfirm(null);
                })
              }
            />
          )}
        </div>
      ))}
      {periods.length === 0 && editing === null && <p className={styles.footer}>Zatím žádné období.</p>}
      {(msg.error || msg.info) && (
        <p role="status" className={msg.error ? styles.msgError : styles.footer}>
          {msg.error ?? msg.info}
        </p>
      )}
    </section>
  );
}

/** Kdo z učitelů má kurzy v období hotové. */
function Readiness({ period: p }: { period: PeriodRow }) {
  const ready = p.teachers.filter((t) => t.ready).length;
  return (
    <details className={styles.ready}>
      <summary>
        <span className={styles.readyCount} data-all={ready === p.teachers.length || undefined}>
          {ready} / {p.teachers.length}
        </span>{" "}
        učitelů má kurzy hotové
      </summary>
      <ul className={styles.readyList}>
        {p.teachers.map((t) => (
          <li key={t.id} data-ready={t.ready || undefined}>
            <span className={styles.readyMark} aria-hidden>
              {t.ready ? <Icon name="tick" size={14} strokeWidth={2.6} /> : "…"}
            </span>
            <span className={styles.grow}>{t.name}</span>
            <span className={styles.email}>
              {t.courses} {plural(t.courses, "kurz", "kurzy", "kurzů")} · {t.ready ? "hotovo" : "ještě připravuje"}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function PublishControl({
  period: p,
  ready,
  confirming,
  pending,
  onAsk,
  onCancel,
  onPublish,
}: {
  period: PeriodRow;
  ready: { ateliers: number; expeditions: number };
  confirming: boolean;
  pending: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onPublish: (withAteliers: boolean, withExpeditions: boolean) => void;
}) {
  const missing = p.teachers.filter((t) => !t.ready);
  const [withAteliers, setWithAteliers] = useState(ready.ateliers > 0);
  const [withExpeditions, setWithExpeditions] = useState(ready.expeditions > 0);
  const label = p.published ? `Zveřejnit nové kurzy (${p.drafts})` : "Zveřejnit kurzy v Zápisech";
  if (!p.enrollOpensAt || !p.enrollClosesAt) {
    return <p className={styles.inviteNote}>Než kurzy zveřejníš, nastav přes „Upravit“, kdy se zápis otevře a kdy skončí.</p>;
  }
  if (confirming) {
    return (
      <div className={styles.publishConfirm} role="alert">
        <p>
          {missing.length > 0 ? (
            <>
              Ještě nemají hotovo: <strong>{missing.map((t) => t.name).join(", ")}</strong>. Jejich rozpracované kurzy se
              zveřejní taky. Přesto zveřejnit?
            </>
          ) : (
            <>Kurzy uvidí všichni studenti a přijde jim oznámení s termínem zápisu. Zveřejnit?</>
          )}
        </p>
        {(ready.ateliers > 0 || ready.expeditions > 0) && (
          <div className={styles.publishAlso}>
            <span>Vyhlásit zároveň se stejným termínem zápisu:</span>
            {ready.ateliers > 0 && (
              <label>
                <input type="checkbox" checked={withAteliers} onChange={(e) => setWithAteliers(e.target.checked)} />
                připravené ateliéry ({ready.ateliers})
              </label>
            )}
            {ready.expeditions > 0 && (
              <label>
                <input type="checkbox" checked={withExpeditions} onChange={(e) => setWithExpeditions(e.target.checked)} />
                připravené expedice ({ready.expeditions})
              </label>
            )}
            <span className={styles.publishAlsoNote}>
              Když už zápis do ateliérů (expedic) běží, přidají se do něj a ponechají si jeho termín.
            </span>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => onPublish(withAteliers, withExpeditions)}>
            {pending ? "Zveřejňuji…" : "Ano, zveřejnit"}
          </button>
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            Zpět
          </button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <button type="button" className="btn btn-primary" onClick={onAsk}>
        {label}
      </button>
    </div>
  );
}

function PeriodForm({ period, suggestedName, onClose }: { period: PeriodRow | null; suggestedName: string; onClose: () => void }) {
  const [state, action, pending] = useActionState<PeriodState, FormData>(savePeriod, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form onSubmit={keepForm(action)} className={styles.periodForm} noValidate>
      {period && <input type="hidden" name="id" value={period.id} />}
      <div className={styles.inviteGrid}>
        <label className={styles.field}>
          Název
          <input name="name" defaultValue={period?.name ?? suggestedName} className={styles.textInput} />
          {fe.name && <span className={styles.msgError}>{fe.name}</span>}
        </label>
        <div className={styles.field}>
          Od
          <DateInput name="startsOn" defaultValue={period?.startsOn ?? ""} ariaLabel="Začátek období" />
          {fe.startsOn && <span className={styles.msgError}>{fe.startsOn}</span>}
        </div>
        <div className={styles.field}>
          Do
          <DateInput name="endsOn" defaultValue={period?.endsOn ?? ""} ariaLabel="Konec období" />
          {fe.endsOn && <span className={styles.msgError}>{fe.endsOn}</span>}
        </div>
      </div>
      <div className={styles.inviteGrid}>
        <div className={styles.field}>
          Zápis do kurzů se otevře
          <DueInput name="enrollOpens" defaultValue={period?.enrollOpens ?? ""} defaultTime="18:00" label="otevření zápisu" />
          {fe.enrollOpens && <span className={styles.msgError}>{fe.enrollOpens}</span>}
        </div>
        <div className={styles.field}>
          Zápis skončí
          <DueInput name="enrollCloses" defaultValue={period?.enrollCloses ?? ""} defaultTime="20:00" label="konce zápisu" />
          {fe.enrollCloses && <span className={styles.msgError}>{fe.enrollCloses}</span>}
        </div>
      </div>
      <p className={styles.inviteNote}>
        Termín zápisu můžeš nastavit i později. Studenti ho uvidí, až kurzy období zveřejníš.
      </p>
      {(state.error || state.info) && (
        <p role="status" className={state.error ? styles.msgError : styles.inviteNote}>
          {state.error ?? state.info}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Ukládám…" : period ? "Uložit" : "Založit období"}
        </button>
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Zavřít
        </button>
      </div>
    </form>
  );
}
