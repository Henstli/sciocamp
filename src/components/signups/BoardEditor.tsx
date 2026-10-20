"use client";

// Vyučující zakládá nebo upravuje rozdělení: šablona (pokoje, vaření, úklid),
// možnosti s kapacitou, volitelně po dnech výjezdu, pravidla a termín.

import { useState, useTransition } from "react";
import { Icon } from "../Icon";
import { DueInput } from "../fields/DateTime";
import { saveBoard } from "@/lib/actions/signups";
import { SIGNUP_TEMPLATES, formatDay, type SignupBoard, type SignupTemplate } from "@/lib/signups";
import { isoToPragueLocal } from "@/lib/time";
import styles from "./signups.module.css";

type Row = { key: number; id?: string; label: string; day: string | null; capacity: string };

let seq = 0;
const nextKey = () => ++seq;

function fromTemplate(t: SignupTemplate, days: string[]): Row[] {
  const tpl = SIGNUP_TEMPLATES[t];
  const base = tpl.options.map((o) => ({ label: o.label, capacity: o.capacity === null ? "" : String(o.capacity) }));
  if (tpl.perDay && days.length > 0) {
    return days.flatMap((day) => base.map((o) => ({ key: nextKey(), ...o, day })));
  }
  return base.map((o) => ({ key: nextKey(), ...o, day: null }));
}

export function BoardEditor({
  board,
  days,
  activitySlug,
  live,
  onDone,
}: {
  board: SignupBoard | null;
  days: string[];
  activitySlug: string;
  live: boolean;
  onDone: () => void;
}) {
  const [template, setTemplate] = useState<SignupTemplate | null>(board ? null : "pokoje");
  const initial = board ?? null;
  const [title, setTitle] = useState(initial?.title ?? SIGNUP_TEMPLATES.pokoje.title);
  const [description, setDescription] = useState(initial?.description ?? SIGNUP_TEMPLATES.pokoje.description);
  const [maxPer, setMaxPer] = useState(String(initial?.maxPerStudent ?? 1));
  const [required, setRequired] = useState(initial?.required ?? true);
  const [showNames, setShowNames] = useState(initial?.showNames ?? true);
  const [rows, setRows] = useState<Row[]>(
    initial
      ? initial.options.map((o) => ({ key: nextKey(), id: o.id, label: o.label, day: o.day, capacity: o.capacity === null ? "" : String(o.capacity) }))
      : fromTemplate("pokoje", days),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pickTemplate = (t: SignupTemplate) => {
    setTemplate(t);
    const tpl = SIGNUP_TEMPLATES[t];
    setTitle(tpl.title);
    setDescription(tpl.description);
    setMaxPer(String(tpl.maxPerStudent));
    setRequired(tpl.required);
    setShowNames(tpl.showNames);
    setRows(fromTemplate(t, days));
  };

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));
  const add = (day: string | null = null) => setRows((rs) => [...rs, { key: nextKey(), label: "", day, capacity: "" }]);

  // Možnosti bez dne zopakovat pro každý den výjezdu (např. „Večeře“ → po, út, st…).
  const expandDays = () =>
    setRows((rs) => {
      const plain = rs.filter((r) => !r.day && r.label.trim());
      const dated = rs.filter((r) => r.day);
      return [...dated, ...days.flatMap((day) => plain.map((r) => ({ key: nextKey(), label: r.label, capacity: r.capacity, day })))].sort(
        (a, b) => (a.day ?? "").localeCompare(b.day ?? ""),
      );
    });
  const canExpand = days.length > 0 && rows.some((r) => !r.day && r.label.trim());

  const submit = (form: HTMLFormElement) =>
    start(async () => {
      setError(null);
      const closesAt = String(new FormData(form).get("closesAt") ?? "");
      const res = await saveBoard(activitySlug, {
        id: board?.id,
        title,
        description,
        maxPerStudent: Number(maxPer) || 1,
        required,
        showNames,
        closesAt,
        options: rows.map((r) => ({
          id: r.id,
          label: r.label,
          day: r.day,
          capacity: r.capacity.trim() === "" ? null : Number(r.capacity),
        })),
      });
      if (res.error) return setError(res.error);
      onDone();
    });

  return (
    <form
      className={`card ${styles.editor}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
    >
      <header className={styles.editorHead}>
        <button type="button" className={styles.iconBtn} onClick={onDone} aria-label="Zpět">
          <Icon name="chevronLeft" size={20} />
        </button>
        <h2 className={styles.boardTitle}>{board ? `Upravit: ${board.title}` : "Nové rozdělení"}</h2>
      </header>

      {!board && (
        <div className={styles.field}>
          Začni ze šablony
          <div className={styles.templates}>
            {(
              [
                ["pokoje", "Pokoje"],
                ["vareni", "Vaření po dnech"],
                ["uklid", "Úklid po dnech"],
                ["vlastni", "Vlastní"],
              ] as const
            ).map(([key, label]) => (
              <button key={key} type="button" className={styles.template} aria-pressed={template === key} onClick={() => pickTemplate(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.grid2}>
        <label className={styles.field}>
          Název
          <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Např. Pokoje" required />
        </label>
        <label className={styles.field}>
          Kolik možností si může student vybrat
          <input className={styles.input} type="number" min={1} max={50} value={maxPer} onChange={(e) => setMaxPer(e.target.value)} />
        </label>
      </div>
      <label className={styles.field}>
        Popis pro studenty (nepovinné)
        <textarea className={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={2} />
      </label>

      <div className={styles.field}>
        Možnosti
        <span className={styles.hint}>Kapacita = kolik lidí se na možnost vejde (prázdná = bez omezení).</span>
        <ul className={styles.rows}>
          {rows.map((r) => (
            <li key={r.key} className={styles.row}>
              {days.length > 0 && (
                <select className={styles.select} value={r.day ?? ""} onChange={(e) => update(r.key, { day: e.target.value || null })} aria-label="Den">
                  <option value="">Bez dne</option>
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {formatDay(d)}
                    </option>
                  ))}
                </select>
              )}
              <input
                className={`${styles.input} ${styles.grow}`}
                value={r.label}
                onChange={(e) => update(r.key, { label: e.target.value })}
                maxLength={80}
                placeholder="Např. Pokoj 1, Večeře, Kuchyně"
                aria-label="Název možnosti"
              />
              <input
                className={`${styles.input} ${styles.capacity}`}
                type="number"
                min={1}
                max={500}
                value={r.capacity}
                onChange={(e) => update(r.key, { capacity: e.target.value })}
                placeholder="∞"
                aria-label="Kapacita"
              />
              <button type="button" className={styles.iconBtn} onClick={() => remove(r.key)} aria-label="Odebrat možnost">
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
        <div className={styles.rowActions}>
          <button type="button" className={styles.small} onClick={() => add()}>
            <Icon name="plus" size={14} /> Přidat možnost
          </button>
          {canExpand && (
            <button type="button" className={styles.small} onClick={expandDays} title="Možnosti bez dne se zkopírují na každý den výjezdu">
              <Icon name="calendar" size={14} /> Zopakovat pro každý den výjezdu
            </button>
          )}
        </div>
        {board && <span className={styles.hint}>Když možnost odebereš, smažou se i přihlášky na ni.</span>}
      </div>

      <div className={styles.grid2}>
        <div className={styles.field}>
          Přihlašovat se dá do (nepovinné)
          <DueInput
            name="closesAt"
            defaultValue={board?.closesAt ? isoToPragueLocal(board.closesAt) : ""}
            defaultTime="20:00"
            label="konce přihlašování"
          />
          <span className={styles.hint}>Potom se studenti nemůžou přihlásit ani odhlásit. Ty můžeš měnit dál.</span>
        </div>
        <div className={styles.checks}>
          <label className={styles.check}>
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            Přihlásit se má každý (uvidíš, kdo chybí)
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} />
            Studenti vidí, kdo je kde přihlášený
          </label>
        </div>
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.rowActions}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Ukládám…" : board ? "Uložit změny" : "Zveřejnit studentům"}
        </button>
        <button type="button" className="btn btn-outline" onClick={onDone}>
          Zrušit
        </button>
        {!live && <span className={styles.hint}>Ukázkový režim: nic se neuloží.</span>}
      </div>
    </form>
  );
}
