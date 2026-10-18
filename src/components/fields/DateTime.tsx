"use client";

// Česká pole pro datum a čas. Vestavěné <input type="date|time|datetime-local">
// přebírá formát z jazyka prohlížeče (v anglickém Chromu mm/dd/rrrr a AM/PM),
// proto si formát řídíme sami: „21. 10. 2026“ a „23:59“.

import { useId, useState } from "react";
import styles from "./fields.module.css";

/** „21. 10. 2026“, „21.10.2026“, „21/10/2026“, „21-10-26“ → „2026-10-21“. Null = neplatné. */
export function parseCzDate(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2}|\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** „2026-10-21“ → „21. 10. 2026“ */
export function formatCzDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : "";
}

/** „9:5“, „9.05“, „905“, „0905“ → „09:05“. Null = neplatné. */
export function parseTime(input: string): string | null {
  const v = input.trim();
  const m = v.match(/^(\d{1,2})\s*[:.]\s*(\d{1,2})$/) ?? v.match(/^(\d{1,2})(\d{2})$/) ?? v.match(/^(\d{1,2})$/);
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

/**
 * Datum ve tvaru dd. mm. rrrr. Do formuláře posílá skryté pole `name`
 * s hodnotou „rrrr-mm-dd“ (nebo prázdné).
 */
export function DateInput({
  name,
  defaultValue = "",
  label,
  ariaLabel,
  onChange,
  required,
}: {
  name?: string;
  /** „rrrr-mm-dd“ */
  defaultValue?: string;
  label?: string;
  ariaLabel?: string;
  /** „rrrr-mm-dd“, prázdný řetězec když je pole prázdné, null když je neplatné */
  onChange?: (iso: string | null) => void;
  required?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(defaultValue ? formatCzDate(defaultValue) : "");
  const iso = text.trim() ? parseCzDate(text) : "";
  const invalid = text.trim() !== "" && iso === null;

  return (
    <span className={styles.wrap}>
      {label && (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd. mm. rrrr"
        value={text}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        required={required}
        className={styles.input}
        onChange={(e) => {
          setText(e.target.value);
          const v = e.target.value.trim();
          onChange?.(v ? parseCzDate(v) : "");
        }}
        onBlur={() => {
          if (iso) setText(formatCzDate(iso));
        }}
      />
      {name && <input type="hidden" name={name} value={invalid ? "neplatne" : (iso ?? "")} />}
      {invalid && <span className={styles.error}>Napiš datum jako 21. 10. 2026.</span>}
    </span>
  );
}

/** Čas ve 24hodinovém formátu („23:59“). Skryté pole `name` nese „HH:MM“. */
export function TimeInput({
  name,
  value,
  defaultValue = "",
  ariaLabel,
  onChange,
  placeholder = "hh:mm",
}: {
  name?: string;
  /** Řízená hodnota „HH:MM“ (když ji rodič drží ve stavu) */
  value?: string;
  defaultValue?: string;
  ariaLabel?: string;
  onChange?: (hhmm: string | null) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value ?? (defaultValue ? formatTime(defaultValue) : ""));
  const parsed = text.trim() ? parseTime(text) : "";
  const invalid = text.trim() !== "" && parsed === null;

  return (
    <span className={styles.wrap}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        className={`${styles.input} ${styles.time}`}
        onChange={(e) => {
          setText(e.target.value);
          const v = e.target.value.trim();
          onChange?.(v ? parseTime(v) : "");
        }}
        onBlur={() => {
          if (parsed) setText(formatTime(parsed));
        }}
      />
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
