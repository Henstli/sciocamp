"use client";

import { useActionState, useState, useTransition } from "react";
import { DateInput } from "@/components/fields/DateTime";
import { Icon } from "@/components/Icon";
import { deleteTerm, saveTerm, type TermState } from "@/lib/actions/terms";
import { plural } from "@/lib/format";
import { formatDateRangeWithYear } from "@/lib/periods";
import { keepForm } from "@/lib/use-keep-form";
import styles from "./admin.module.css";

export type TermRow = {
  id: string;
  kind: "atelier" | "expedice";
  name: string | null;
  startsOn: string;
  endsOn: string;
  /** Kolik ateliérů / expedic v termínu je */
  used: number;
  ended: boolean;
};

const KINDS = [
  ["atelier", "Termíny ateliérů", "Ateliér trvá několik dní až desítky dní. Souběžné ateliéry ve stejném termínu si student vybírá mezi sebou."],
  ["expedice", "Týdny expedic", "Expedice jsou jednou za měsíc po–pá. Stačí vybrat pondělí, pátek se doplní sám."],
] as const;

/** Admin předem zadá termíny ateliérů a expedic; učitel pak jen vybere ze seznamu. */
export function TermManager({ terms }: { terms: TermRow[] }) {
  const [editing, setEditing] = useState<TermRow | { kind: "atelier" | "expedice" } | null>(null);
  const [msg, setMsg] = useState<TermState>({});
  const [confirm, setConfirm] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [pending, start] = useTransition();

  return (
    <section aria-label="Termíny ateliérů a expedic" className={`card ${styles.table} ${styles.periods}`}>
      <div className={styles.toolbar}>
        <div>
          <h2 className="section-title">Termíny ateliérů a expedic</h2>
          <p className={styles.inviteNote}>
            Učitelé u ateliéru nebo expedice nevypisují data, jen vyberou jeden z těchto termínů. Když termín posuneš, posunou se
            i ateliéry a expedice v něm.
          </p>
        </div>
      </div>

      {KINDS.map(([kind, title, hint]) => {
        const list = terms.filter((t) => t.kind === kind && (showPast || !t.ended));
        const formHere = editing && editing.kind === kind;
        return (
          <div key={kind} className={styles.termGroup}>
            <div className={styles.termHead}>
              <div>
                <h3 className={styles.termTitle}>{title}</h3>
                <p className={styles.inviteNote}>{hint}</p>
              </div>
              {!formHere && (
                <button type="button" className="btn btn-outline" onClick={() => setEditing({ kind })}>
                  <Icon name="plus" size={16} strokeWidth={2.8} />
                  {kind === "atelier" ? "Termín ateliérů" : "Týden expedic"}
                </button>
              )}
            </div>
            {formHere && (
              <TermForm
                key={"id" in editing ? editing.id : `new-${kind}`}
                term={"id" in editing ? editing : null}
                kind={kind}
                onClose={() => setEditing(null)}
              />
            )}
            {list.length === 0 && !formHere && <p className={styles.footer}>Zatím žádný termín.</p>}
            {list.map((t) => (
              <div key={t.id} className={styles.termRow}>
                <div className={styles.courseMain}>
                  <div className={styles.name}>
                    {formatDateRangeWithYear(t.startsOn, t.endsOn)}
                    {t.name && <span className={styles.termName}> · {t.name}</span>}
                  </div>
                  <div className={styles.email}>
                    {t.ended
                      ? "Proběhlo"
                      : t.used === 0
                        ? "Zatím nic"
                        : `${t.used} ${kind === "atelier" ? plural(t.used, "ateliér", "ateliéry", "ateliérů") : plural(t.used, "expedice", "expedice", "expedic")}`}
                  </div>
                </div>
                <button type="button" className="btn btn-outline" style={{ minHeight: 40 }} onClick={() => setEditing(t)}>
                  Upravit
                </button>
                {confirm === t.id ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ minHeight: 40, color: "var(--late-fg)", borderColor: "var(--late-line)" }}
                    disabled={pending}
                    onClick={() => start(async () => setMsg(await deleteTerm(t.id)))}
                  >
                    Opravdu smazat?
                  </button>
                ) : (
                  <button type="button" className="btn btn-outline" style={{ minHeight: 40 }} onClick={() => setConfirm(t.id)}>
                    Smazat
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {terms.some((t) => t.ended) && (
        <button type="button" className={`btn btn-outline ${styles.showPast}`} onClick={() => setShowPast((v) => !v)}>
          {showPast ? "Skrýt proběhlé termíny" : "Ukázat i proběhlé termíny"}
        </button>
      )}
      {(msg.error || msg.info) && (
        <p role="status" className={msg.error ? styles.msgError : styles.footer}>
          {msg.error ?? msg.info}
        </p>
      )}
    </section>
  );
}

function TermForm({ term, kind, onClose }: { term: TermRow | null; kind: "atelier" | "expedice"; onClose: () => void }) {
  const [state, action, pending] = useActionState<TermState, FormData>(saveTerm, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form onSubmit={keepForm(action)} className={styles.periodForm} noValidate>
      {term && <input type="hidden" name="id" value={term.id} />}
      <input type="hidden" name="kind" value={kind} />
      <div className={styles.inviteGrid}>
        <label className={styles.field}>
          Název (nepovinné)
          <input
            name="name"
            defaultValue={term?.name ?? ""}
            placeholder={kind === "atelier" ? "např. Ateliéry listopad" : "např. Expedice listopad"}
            className={styles.textInput}
          />
        </label>
        <div className={styles.field}>
          {kind === "expedice" ? "Pondělí" : "Od"}
          <DateInput name="startsOn" defaultValue={term?.startsOn ?? ""} ariaLabel="Začátek termínu" />
          {fe.startsOn && <span className={styles.msgError}>{fe.startsOn}</span>}
        </div>
        <div className={styles.field}>
          {kind === "expedice" ? "Pátek (nepovinné)" : "Do"}
          <DateInput name="endsOn" defaultValue={term?.endsOn ?? ""} ariaLabel="Konec termínu" />
          {fe.endsOn && <span className={styles.msgError}>{fe.endsOn}</span>}
        </div>
      </div>
      {(state.error || state.info) && (
        <p role="status" className={state.error ? styles.msgError : styles.inviteNote}>
          {state.error ?? state.info}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Ukládám…" : term ? "Uložit" : "Přidat"}
        </button>
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Zavřít
        </button>
      </div>
    </form>
  );
}
