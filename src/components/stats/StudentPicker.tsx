"use client";

// Vyhledání studenta ve Statistikách: píše se jméno (bez diakritiky stačí),
// šipky + Enter nebo klik otevře jeho statistiky.

import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { fold } from "@/lib/search";
import styles from "./stats.module.css";

export type PickerStudent = { id: string; name: string; grade: number | null; handedRate: number | null };

export function StudentPicker({ students, query }: { students: PickerStudent[]; query: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);

  const found = useMemo(() => {
    const f = fold(q.trim());
    if (!f) return students.slice(0, 8);
    return students
      .filter((s) => fold(s.name).split(/\s+/).some((w) => w.startsWith(f)) || fold(s.name).includes(f))
      .slice(0, 8);
  }, [q, students]);

  const go = (s: PickerStudent) => {
    setOpen(false);
    router.push(`/statistiky/${s.id}${query}`);
  };

  return (
    <div className={styles.picker}>
      <label className={styles.pickerField}>
        <Icon name="search" size={18} />
        <span className="sr-only">Najít studenta</span>
        <input
          ref={input}
          type="search"
          value={q}
          placeholder="Najít studenta…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && found[active] ? `${listId}-${active}` : undefined}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, found.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && found[active]) {
              e.preventDefault();
              go(found[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
              input.current?.blur();
            }
          }}
        />
      </label>
      {open && (
        <ul id={listId} role="listbox" className={styles.pickerList}>
          {found.length === 0 && <li className={styles.pickerEmpty}>Nikdo takový tu není.</li>}
          {found.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={styles.pickerItem}
              onMouseDown={(e) => {
                e.preventDefault();
                go(s);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className={styles.pickerName}>{s.name}</span>
              <span className={styles.pickerMeta}>{s.grade ? `${s.grade}. ročník` : "bez ročníku"}</span>
              {s.handedRate !== null && (
                <span className={styles.pickerRate} data-tone={s.handedRate >= 0.85 ? "ok" : s.handedRate >= 0.7 ? "wait" : "late"}>
                  {Math.round(s.handedRate * 100)} %
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
