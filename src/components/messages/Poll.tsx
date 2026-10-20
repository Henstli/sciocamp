"use client";

// Ankety ve skupinových chatech: karta ankety ve zprávě a formulář nad polem pro psaní.

import { useState } from "react";
import { Icon } from "../Icon";
import { plural } from "@/lib/format";
import { myChoices, pollVoterCount } from "@/lib/polls";
import type { ChatPoll } from "@/lib/types";
import styles from "./poll.module.css";

const MAX_OPTIONS = 10;

export function PollCard({
  poll,
  meId,
  mine,
  canClose,
  nameOf,
  onVote,
  onClose,
}: {
  poll: ChatPoll;
  meId: string;
  /** Moje zpráva (vpravo, modře) */
  mine: boolean;
  /** Smím anketu ukončit / znovu otevřít */
  canClose: boolean;
  nameOf: (id: string) => string;
  /** Nové moje volby (prázdné = zrušit hlas) */
  onVote: (choices: string[]) => void;
  onClose: (closed: boolean) => void;
}) {
  const chosen = myChoices(poll, meId);
  const voters = pollVoterCount(poll);
  const closed = !!poll.closedAt;
  const top = Math.max(0, ...poll.options.map((o) => o.voterIds.length));

  const pick = (id: string) => {
    if (closed) return;
    if (poll.multiple) onVote(chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id]);
    else onVote(chosen.includes(id) ? [] : [id]);
  };

  return (
    <div className={styles.card} data-mine={mine} data-closed={closed} role="group" aria-label={`Anketa: ${poll.question}`}>
      <div className={styles.kicker}>
        <Icon name="vote" size={14} />
        Anketa{poll.multiple ? " · víc odpovědí" : ""}
        {closed && <span className={styles.closedChip}>Ukončená</span>}
      </div>
      <p className={styles.question}>{poll.question}</p>
      <ul className={styles.options}>
        {poll.options.map((o) => {
          const count = o.voterIds.length;
          const pct = voters > 0 ? Math.round((count / voters) * 100) : 0;
          const selected = chosen.includes(o.id);
          const names = o.voterIds.map((id) => (id === meId ? "Ty" : nameOf(id))).join(", ");
          return (
            <li key={o.id}>
              <button
                type="button"
                className={styles.option}
                data-selected={selected}
                data-winner={closed && count > 0 && count === top}
                aria-pressed={selected}
                disabled={closed}
                onClick={() => pick(o.id)}
                title={names || "Zatím nikdo"}
              >
                <span className={styles.fill} style={{ width: `${pct}%` }} aria-hidden="true" />
                <span className={styles.mark} data-multiple={poll.multiple} aria-hidden="true">
                  {selected && <Icon name="tick" size={12} />}
                </span>
                <span className={styles.label}>{o.label}</span>
                <span className={styles.count}>
                  {count > 0 ? `${count} · ${pct} %` : "0"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className={styles.foot}>
        <span>
          {voters === 0 ? "Zatím nikdo nehlasoval" : `${voters} ${plural(voters, "hlasoval", "hlasovali", "hlasovalo")}`}
          {!closed && chosen.length === 0 && " · klikni na možnost"}
        </span>
        {canClose && (
          <button type="button" className={styles.footBtn} onClick={() => onClose(!closed)}>
            {closed ? "Znovu otevřít" : "Ukončit anketu"}
          </button>
        )}
      </div>
    </div>
  );
}

export function PollComposer({
  busy,
  error,
  onCancel,
  onCreate,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onCreate: (question: string, options: string[], multiple: boolean) => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const filled = options.filter((o) => o.trim()).length;
  const ready = question.trim().length > 0 && filled >= 2;

  return (
    <form
      className={styles.composer}
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) onCreate(question.trim(), options.map((o) => o.trim()).filter(Boolean), multiple);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className={styles.composerHead}>
        <Icon name="vote" size={18} />
        <strong>Nová anketa</strong>
        <button type="button" className={styles.close} onClick={onCancel} aria-label="Zavřít">
          <Icon name="close" size={16} />
        </button>
      </div>
      <label className={styles.field}>
        <span className="sr-only">Otázka</span>
        <input className={styles.input} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Na co se chceš zeptat?" maxLength={200} autoFocus />
      </label>
      <ol className={styles.optionInputs}>
        {options.map((o, i) => (
          <li key={i} className={styles.optionRow}>
            <input
              className={styles.input}
              value={o}
              onChange={(e) => setOptions((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={`Možnost ${i + 1}`}
              maxLength={100}
              aria-label={`Možnost ${i + 1}`}
              onKeyDown={(e) => {
                // Enter v poslední vyplněné možnosti přidá další řádek.
                if (e.key === "Enter" && i === options.length - 1 && o.trim() && options.length < MAX_OPTIONS) {
                  e.preventDefault();
                  setOptions((list) => [...list, ""]);
                }
              }}
            />
            {options.length > 2 && (
              <button type="button" className={styles.remove} onClick={() => setOptions((list) => list.filter((_, j) => j !== i))} aria-label={`Odebrat možnost ${i + 1}`}>
                <Icon name="close" size={14} />
              </button>
            )}
          </li>
        ))}
      </ol>
      <div className={styles.composerRow}>
        {options.length < MAX_OPTIONS && (
          <button type="button" className={styles.add} onClick={() => setOptions((list) => [...list, ""])}>
            <Icon name="plus" size={14} /> Přidat možnost
          </button>
        )}
        <label className={styles.check}>
          <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} />
          Jde vybrat víc možností
        </label>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.composerActions}>
        <button type="button" className="btn btn-outline" onClick={onCancel}>
          Zrušit
        </button>
        <button type="submit" className="btn btn-primary" disabled={!ready || busy}>
          {busy ? "Zakládám…" : "Založit anketu"}
        </button>
      </div>
    </form>
  );
}
