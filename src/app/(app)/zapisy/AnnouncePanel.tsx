"use client";

import { useActionState, useState, useTransition } from "react";
import { DueInput } from "@/components/fields/DateTime";
import { Icon } from "@/components/Icon";
import { announceRound, joinRound, setAnnounceReady, updateRound, type RoundState } from "@/lib/actions/rounds";
import { plural } from "@/lib/format";
import { formatDue, isoToPragueLocal } from "@/lib/time";
import { keepForm } from "@/lib/use-keep-form";
import styles from "./zapisy.module.css";

export type PanelItem = { slug: string; title: string; teacher: string; when: string; mine: boolean };

export type AnnouncePanelData = {
  kind: "atelier" | "expedice";
  /** Vyhlášené kolo, které ještě neskončilo */
  round: { id: string; opensAt: string; closesAt: string; editable: boolean } | null;
  /** Připravené k vyhlášení (od všech učitelů) */
  ready: PanelItem[];
  /** Rozpracované — studenti je nevidí, učitel je ještě neoznačil */
  drafts: PanelItem[];
};

const WORDS = {
  atelier: {
    title: "Vyhlášení zápisu do ateliérů",
    what: "ateliér",
    many: ["ateliér", "ateliéry", "ateliérů"],
    none: "Zatím není žádný ateliér připravený k vyhlášení.",
    next: "Každý další připravený ateliér",
  },
  expedice: {
    title: "Vyhlášení zápisu na expedice",
    what: "expedici",
    many: ["expedici", "expedice", "expedic"],
    none: "Zatím není žádná expedice připravená k vyhlášení.",
    next: "Každá další připravená expedice",
  },
} as const;

/**
 * Pro učitele: ateliéry a expedice se vyhlašují hromadně jedním termínem.
 * Dokud vyhlášený zápis neskončí, další připravené se přidávají do něj.
 */
export function AnnouncePanel({ data }: { data: AnnouncePanelData }) {
  const w = WORDS[data.kind];
  return (
    <section aria-label={w.title} className={`card ${styles.panel}`}>
      <div className={styles.panelHead}>
        <Icon name="vote" size={20} />
        <h2 className={styles.panelTitle}>{w.title}</h2>
        <span className={styles.panelBadge}>jen pro učitele</span>
      </div>
      {data.round ? <RunningRound data={data} /> : <NewRound data={data} />}
      {data.drafts.length > 0 && <Drafts items={data.drafts} what={w.what} />}
    </section>
  );
}

function NewRound({ data }: { data: AnnouncePanelData }) {
  const w = WORDS[data.kind];
  const [state, action, pending] = useActionState<RoundState, FormData>(announceRound, {});
  const [picked, setPicked] = useState(() => new Set(data.ready.map((i) => i.slug)));
  const fe = state.fieldErrors ?? {};
  if (data.ready.length === 0) {
    return (
      <p className={styles.note}>
        {w.none} Učitel to označí v Moje třídy → Upravit → „Připraveno k vyhlášení
        zápisu“ (nebo níže u rozpracovaných).
      </p>
    );
  }
  return (
    <form onSubmit={keepForm(action)} className={styles.panelForm} noValidate>
      <input type="hidden" name="kind" value={data.kind} />
      <p className={styles.note}>
        Vyber, co do zápisu zařadit, a nastav jeden termín pro všechny. Studentům přijde jedno oznámení. Dokud zápis neskončí,
        další připravené se přidají do něj — nový termín se nezakládá.
      </p>
      <ul className={styles.pickList}>
        {data.ready.map((i) => (
          <li key={i.slug}>
            <label>
              <input
                type="checkbox"
                name="items"
                value={i.slug}
                checked={picked.has(i.slug)}
                onChange={(e) =>
                  setPicked((s) => {
                    const n = new Set(s);
                    if (e.target.checked) n.add(i.slug);
                    else n.delete(i.slug);
                    return n;
                  })
                }
              />
              <span className={styles.pickText}>
                <strong>{i.title}</strong>
                <span>
                  {i.teacher} · {i.when}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {fe.items && <p className={styles.error}>{fe.items}</p>}
      <div className={styles.windowFields}>
        <div className={styles.windowField}>
          <span>Zápis se otevře</span>
          <DueInput name="enrollOpens" defaultTime="18:00" label="otevření zápisu" />
          {fe.enrollOpens && <span className={styles.error}>{fe.enrollOpens}</span>}
        </div>
        <div className={styles.windowField}>
          <span>Zápis skončí</span>
          <DueInput name="enrollCloses" defaultTime="20:00" label="konce zápisu" />
          {fe.enrollCloses && <span className={styles.error}>{fe.enrollCloses}</span>}
        </div>
      </div>
      {(state.error || state.info) && (
        <p role="status" className={state.error ? styles.error : styles.note}>
          {state.error ?? state.info}
        </p>
      )}
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending || picked.size === 0}>
          {pending ? "Vyhlašuji…" : `Vyhlásit zápis (${picked.size} ${plural(picked.size, w.many[0], w.many[1], w.many[2])})`}
        </button>
      </div>
    </form>
  );
}

function RunningRound({ data }: { data: AnnouncePanelData }) {
  const round = data.round!;
  const w = WORDS[data.kind];
  const [editing, setEditing] = useState(false);
  return (
    <div className={styles.panelForm}>
      <div className={styles.roundLine}>
        <span>
          Zápis je vyhlášený: <strong>{formatDue(round.opensAt)} – {formatDue(round.closesAt)}</strong>.
        </span>
        {round.editable && !editing && (
          <button type="button" className="btn btn-outline" onClick={() => setEditing(true)}>
            Upravit termín
          </button>
        )}
      </div>
      {editing && <EditRound round={round} onClose={() => setEditing(false)} />}
      {data.ready.length > 0 ? (
        <>
          <p className={styles.note}>Připravené, ale ještě nezařazené — přidej je do tohoto zápisu:</p>
          <ul className={styles.pickList}>
            {data.ready.map((i) => (
              <JoinRow key={i.slug} item={i} roundId={round.id} />
            ))}
          </ul>
        </>
      ) : (
        <p className={styles.note}>
          {w.next} se přidá sem (dokud zápis neskončí), ať studenti nemají pořád nové termíny.
        </p>
      )}
    </div>
  );
}

function JoinRow({ item: i, roundId }: { item: PanelItem; roundId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<RoundState>({});
  return (
    <li className={styles.joinRow}>
      <span className={styles.pickText}>
        <strong>{i.title}</strong>
        <span>
          {i.teacher} · {i.when}
        </span>
        {(msg.error || msg.info) && <span className={msg.error ? styles.error : styles.note}>{msg.error ?? msg.info}</span>}
      </span>
      <button type="button" className="btn btn-soft" disabled={pending} onClick={() => start(async () => setMsg(await joinRound(roundId, i.slug)))}>
        {pending ? "Přidávám…" : "Přidat do zápisu"}
      </button>
    </li>
  );
}

function EditRound({ round, onClose }: { round: NonNullable<AnnouncePanelData["round"]>; onClose: () => void }) {
  const [state, action, pending] = useActionState<RoundState, FormData>(updateRound, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form onSubmit={keepForm(action)} className={styles.panelForm} noValidate>
      <input type="hidden" name="roundId" value={round.id} />
      <div className={styles.windowFields}>
        <div className={styles.windowField}>
          <span>Zápis se otevře</span>
          <DueInput name="enrollOpens" defaultValue={isoToPragueLocal(round.opensAt)} label="otevření zápisu" />
          {fe.enrollOpens && <span className={styles.error}>{fe.enrollOpens}</span>}
        </div>
        <div className={styles.windowField}>
          <span>Zápis skončí</span>
          <DueInput name="enrollCloses" defaultValue={isoToPragueLocal(round.closesAt)} label="konce zápisu" />
          {fe.enrollCloses && <span className={styles.error}>{fe.enrollCloses}</span>}
        </div>
      </div>
      {(state.error || state.info) && (
        <p role="status" className={state.error ? styles.error : styles.note}>
          {state.error ?? state.info}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Ukládám…" : "Uložit termín"}
        </button>
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Zavřít
        </button>
      </div>
    </form>
  );
}

function Drafts({ items, what }: { items: PanelItem[]; what: string }) {
  return (
    <details className={styles.drafts}>
      <summary>
        Rozpracované ({items.length}) — studenti je zatím nevidí
      </summary>
      <ul className={styles.pickList}>
        {items.map((i) => (
          <DraftRow key={i.slug} item={i} what={what} />
        ))}
      </ul>
    </details>
  );
}

function DraftRow({ item: i, what }: { item: PanelItem; what: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<RoundState>({});
  return (
    <li className={styles.joinRow}>
      <span className={styles.pickText}>
        <strong>{i.title}</strong>
        <span>
          {i.teacher} · {i.when}
        </span>
        {(msg.error || msg.info) && <span className={msg.error ? styles.error : styles.note}>{msg.error ?? msg.info}</span>}
      </span>
      {i.mine ? (
        <button
          type="button"
          className="btn btn-outline"
          disabled={pending}
          onClick={() => start(async () => setMsg(await setAnnounceReady(i.slug, true)))}
        >
          {pending ? "Ukládám…" : what === "expedici" ? "Moje expedice je připravená" : "Můj ateliér je připravený"}
        </button>
      ) : (
        <span className={styles.note}>čeká na vyučujícího</span>
      )}
    </li>
  );
}
