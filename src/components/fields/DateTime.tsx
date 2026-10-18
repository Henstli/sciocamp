"use client";

// Česká pole pro datum a čas. Vestavěné <input type="date|time|datetime-local">
// přebírá formát z jazyka prohlížeče (v anglickém Chromu mm/dd/rrrr a AM/PM),
// proto si formát řídíme sami: „21. 10. 2026“ a „23:59“.
//
// Datum jde vybrat v kalendáři nebo napsat volně („1 11 2026“, „1.11.“,
// „01112026“). Čas jde vybrat z nabídky nebo napsat („1230“, „12 30“, „9“).

import { useEffect, useId, useRef, useState } from "react";
import styles from "./fields.module.css";

// ---------------------------------------------------------------------------
// Převody
// ---------------------------------------------------------------------------

function isoOf(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Volně napsané datum → „rrrr-mm-dd“. Bere „21. 10. 2026“, „21.10.26“,
 * „21 10 2026“, „21/10/2026“, „21102026“, „211026“ a bez roku „21. 10.“
 * (pak doplní `year`). Null = neplatné.
 */
export function parseCzDate(input: string, year?: number): string | null {
  const v = input.trim();
  const digits = v.match(/^(\d{2})(\d{2})(\d{2}|\d{4})$/);
  const parts = digits ?? v.match(/^(\d{1,2})\s*[./\-, ]\s*(\d{1,2})\s*(?:[./\-, ]\s*(\d{2}|\d{4})?)?\s*\.?$/);
  if (!parts) return null;
  const d = Number(parts[1]);
  const m = Number(parts[2]);
  let y = parts[3] ? Number(parts[3]) : year;
  if (!y) return null;
  if (y < 100) y += 2000;
  return isoOf(y, m, d);
}

/** „2026-10-21“ → „21. 10. 2026“ */
export function formatCzDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : "";
}

/** „9:5“, „9.05“, „9 05“, „905“, „0905“, „9“ → „09:05“. Null = neplatné. */
export function parseTime(input: string): string | null {
  const v = input.trim().replace(/\s*h$/i, "");
  const m =
    v.match(/^(\d{1,2})\s*[:.,\s]\s*(\d{1,2})$/) ?? v.match(/^(\d{1,2})(\d{2})$/) ?? v.match(/^(\d{1,2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** „09:05“ → „9:05“ */
export function formatTime(hhmm: string): string {
  return hhmm.replace(/^0(\d)/, "$1");
}

// ---------------------------------------------------------------------------
// Společné: zavření vyskakovacího okna kliknutím mimo
// ---------------------------------------------------------------------------

function useOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [ref, open, close]);
}

// ---------------------------------------------------------------------------
// Kalendář
// ---------------------------------------------------------------------------

const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

function todayIso() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" });
  return p.format(new Date());
}

function Calendar({
  selected,
  today,
  onPick,
  onClose,
}: {
  selected: string | null;
  today: string;
  onPick: (iso: string) => void;
  onClose: () => void;
}) {
  const start = selected || today;
  const [view, setView] = useState({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) });
  const first = new Date(Date.UTC(view.y, view.m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // pondělí = 0
  const days = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: days }, (_, i) => isoOf(view.y, view.m, i + 1)),
  ];
  const move = (delta: number) =>
    setView(({ y, m }) => {
      const n = m + delta;
      return n < 1 ? { y: y - 1, m: 12 } : n > 12 ? { y: y + 1, m: 1 } : { y, m: n };
    });

  return (
    <div
      className={styles.popover}
      role="dialog"
      aria-label="Vybrat datum"
      // Pole bývá uvnitř <label>; klik do kalendáře nesmí přeskočit na první input.
      onClick={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className={styles.calHead}>
        <button type="button" className={styles.calNav} onClick={() => move(-1)} aria-label="Předchozí měsíc">
          ‹
        </button>
        <span className={styles.calTitle}>
          {MONTHS[view.m - 1]} {view.y}
        </span>
        <button type="button" className={styles.calNav} onClick={() => move(1)} aria-label="Další měsíc">
          ›
        </button>
      </div>
      <div className={styles.calGrid}>
        {WEEKDAYS.map((d) => (
          <span key={d} className={styles.calDow}>
            {d}
          </span>
        ))}
        {cells.map((iso, i) =>
          iso ? (
            <button
              key={iso}
              type="button"
              className={styles.calDay}
              data-selected={iso === selected || undefined}
              data-today={iso === today || undefined}
              data-weekend={i % 7 >= 5 || undefined}
              aria-label={formatCzDate(iso)}
              aria-pressed={iso === selected}
              onClick={() => onPick(iso)}
            >
              {Number(iso.slice(8))}
            </button>
          ) : (
            <span key={`x${i}`} />
          ),
        )}
      </div>
      <div className={styles.calFoot}>
        <button type="button" className={styles.calLink} onClick={() => onPick(today)}>
          Dnes
        </button>
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

/**
 * Datum ve tvaru dd. mm. rrrr s kalendářem. Do formuláře posílá skryté pole
 * `name` s hodnotou „rrrr-mm-dd“ (nebo prázdné, „neplatne“ při chybě).
 */
export function DateInput({
  name,
  defaultValue = "",
  ariaLabel,
  onChange,
  required,
}: {
  name?: string;
  /** „rrrr-mm-dd“ */
  defaultValue?: string;
  ariaLabel?: string;
  /** „rrrr-mm-dd“, prázdný řetězec když je pole prázdné, null když je neplatné */
  onChange?: (iso: string | null) => void;
  required?: boolean;
}) {
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(defaultValue ? formatCzDate(defaultValue) : "");
  // Hodnota se počítá při psaní (v obsluze události), ne při vykreslení —
  // u data bez roku potřebujeme letošní rok.
  const [iso, setIso] = useState<string | null>(defaultValue || "");
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState("");
  const invalid = iso === null;
  useOutside(box, open, () => setOpen(false));

  function update(value: string) {
    setText(value);
    const v = value.trim();
    const parsed = v ? parseCzDate(v, Number(todayIso().slice(0, 4))) : "";
    setIso(parsed);
    onChange?.(parsed);
  }

  function pick(value: string) {
    setText(formatCzDate(value));
    setIso(value);
    onChange?.(value);
    setOpen(false);
    field.current?.focus();
  }

  return (
    <span className={styles.wrap} ref={box}>
      <span className={styles.control}>
        <input
          ref={field}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd. mm. rrrr"
          value={text}
          aria-label={ariaLabel}
          aria-invalid={invalid}
          required={required}
          className={`${styles.input} ${styles.withButton}`}
          onChange={(e) => update(e.target.value)}
          onBlur={() => {
            if (iso) setText(formatCzDate(iso));
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && e.altKey) {
              setToday(todayIso());
              setOpen(true);
            }
          }}
        />
        <button
          type="button"
          className={styles.fieldButton}
          aria-label={`${ariaLabel ?? "Datum"} – otevřít kalendář`}
          aria-expanded={open}
          onClick={() => {
            setToday(todayIso());
            setOpen((o) => !o);
          }}
        >
          <CalendarIcon />
        </button>
      </span>
      {open && <Calendar selected={iso || null} today={today} onPick={pick} onClose={() => setOpen(false)} />}
      {name && <input type="hidden" name={name} value={invalid ? "neplatne" : iso} />}
      {invalid && <span className={styles.error}>Tohle datum neznám — vyber ho v kalendáři.</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Čas
// ---------------------------------------------------------------------------

/** Nabídka časů: 6:00–22:00 po čtvrthodinách a 23:59 (konec dne pro termíny). */
const TIMES = [
  ...Array.from({ length: (22 - 6) * 4 + 1 }, (_, i) => {
    const min = 6 * 60 + i * 15;
    return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
  }),
  "23:59",
];

/** Čas ve 24hodinovém formátu („23:59“) s nabídkou. Skryté pole `name` nese „HH:MM“. */
export function TimeInput({
  name,
  defaultValue = "",
  ariaLabel,
  onChange,
  placeholder = "hh:mm",
}: {
  name?: string;
  defaultValue?: string;
  ariaLabel?: string;
  onChange?: (hhmm: string | null) => void;
  placeholder?: string;
}) {
  const listId = useId();
  const box = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [text, setText] = useState(defaultValue ? formatTime(defaultValue) : "");
  const [open, setOpen] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [active, setActive] = useState(-1);
  const parsed = text.trim() ? parseTime(text) : "";
  const invalid = text.trim() !== "" && parsed === null;
  useOutside(box, open, () => setOpen(false));

  // Při psaní nabídka ukáže časy, které začínají napsanou hodinou („12“ → 12:00, 12:15…).
  const typedHour = text.trim().match(/^(\d{1,2})/)?.[1];
  const options = filtering && typedHour ? TIMES.filter((t) => t.split(":")[0] === String(Number(typedHour))) : TIMES;
  const current = parsed ? formatTime(parsed) : "";

  // Po otevření nabídky posunout na vybraný čas (nebo 8:00).
  useEffect(() => {
    if (!open || filtering || !list.current) return;
    const target = list.current.querySelector<HTMLElement>(`[data-time="${current || "8:00"}"]`);
    if (target) list.current.scrollTop = target.offsetTop - 4;
  }, [open, filtering, current]);

  function choose(t: string) {
    setText(t);
    setFiltering(false);
    setOpen(false);
    setActive(-1);
    onChange?.(parseTime(t));
  }

  return (
    <span className={`${styles.wrap} ${styles.timeWrap}`} ref={box}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        placeholder={placeholder}
        value={text}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        className={`${styles.input} ${styles.time}`}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setFiltering(true);
          setOpen(true);
          setActive(-1);
          const v = e.target.value.trim();
          onChange?.(v ? parseTime(v) : "");
        }}
        onBlur={() => {
          if (parsed) setText(formatTime(parsed));
          setFiltering(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => {
              const n = e.key === "ArrowDown" ? a + 1 : a - 1;
              return Math.max(0, Math.min(options.length - 1, n));
            });
          } else if (e.key === "Enter" && open && active >= 0 && options[active]) {
            e.preventDefault();
            choose(options[active]);
          } else if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          } else if (e.key === "Tab") {
            setOpen(false);
          }
        }}
      />
      {open && options.length > 0 && (
        <ul className={`${styles.popover} ${styles.timeList}`} id={listId} role="listbox" ref={list} onClick={(e) => e.preventDefault()}>
          {options.map((t, i) => (
            <li
              key={t}
              id={`${listId}-${i}`}
              role="option"
              data-time={t}
              aria-selected={t === current}
              data-active={i === active || undefined}
              className={styles.timeOption}
              // mousedown, aby se pole nestihlo rozostřit dřív než výběr
              onPointerDown={(e) => {
                e.preventDefault();
                choose(t);
              }}
            >
              {t}
            </li>
          ))}
        </ul>
      )}
      {name && <input type="hidden" name={name} value={invalid ? "neplatne" : (parsed ?? "")} />}
    </span>
  );
}

/**
 * Termín (datum + čas). Skryté pole `name` nese „rrrr-mm-ddTHH:MM“ v pražském
 * čase, nebo prázdnou hodnotu. Čas je předvyplněný na 23:59.
 */
export function DueInput({ name, defaultValue = "" }: { name: string; defaultValue?: string }) {
  // "" = bez termínu, null = neplatně vyplněno
  const [date, setDate] = useState<string | null>(defaultValue.slice(0, 10));
  const [time, setTime] = useState<string | null>(defaultValue ? defaultValue.slice(11, 16) : "23:59");
  const value = date === "" ? "" : date && time !== null ? `${date}T${time || "23:59"}` : "neplatne";

  return (
    <span className={styles.due}>
      <DateInput ariaLabel="Datum termínu" defaultValue={defaultValue.slice(0, 10)} onChange={setDate} />
      <TimeInput ariaLabel="Čas termínu" defaultValue={time || "23:59"} onChange={setTime} />
      <input type="hidden" name={name} value={value} />
    </span>
  );
}
