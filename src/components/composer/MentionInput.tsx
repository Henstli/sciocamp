"use client";

// Pole pro psaní zprávy se zmínkami: po napsání „@“ a pár písmen nabídne lidi,
// šipkami a Enterem (nebo kliknutím) se vybírá. Vybrané jméno se vloží jako
// „@Jméno Příjmení “; při odeslání ho encodeMentions převede na zmínku.

import { useState, type ChangeEvent, type KeyboardEvent, type RefObject } from "react";
import { Avatar } from "../PageHeader";
import { matchPeople, mentionQuery } from "@/lib/mentions";
import type { Role } from "@/lib/types";
import styles from "./composer.module.css";

export type MentionCandidate = { id: string; name: string; initials: string; role: Role };

export function MentionInput({
  value,
  onChange,
  inputRef,
  people,
  placeholder,
  maxLength,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  /** Koho jde zmínit (bez mě) */
  people: MentionCandidate[];
  placeholder?: string;
  maxLength?: number;
  className?: string;
}) {
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const found = query ? matchPeople(people, query.query) : [];
  const open = !!query && found.length > 0;

  const update = (el: HTMLInputElement) => {
    const q = mentionQuery(el.value, el.selectionStart ?? el.value.length);
    setQuery(q);
    setActive(0);
  };

  const pick = (p: MentionCandidate) => {
    const el = inputRef.current;
    if (!el || !query) return;
    const caret = el.selectionStart ?? value.length;
    const insert = `@${p.name} `;
    const next = value.slice(0, query.start) + insert + value.slice(caret);
    onChange(next);
    setQuery(null);
    const pos = query.start + insert.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % found.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + found.length) % found.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(found[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery(null);
    }
  };

  return (
    <span className={styles.mentionWrap}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        className={className}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          onChange(e.target.value);
          update(e.target);
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => update(e.currentTarget)}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={open ? "zminky" : undefined}
      />
      {open && (
        <ul id="zminky" className={styles.mentionList} role="listbox" aria-label="Zmínit">
          {found.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={styles.mentionOption}
                data-active={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                onMouseEnter={() => setActive(i)}
              >
                <Avatar initials={p.initials} userId={p.id} size={26} tone={p.role === "student" ? "student" : "late"} />
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
