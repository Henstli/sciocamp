"use client";

// Výběr dalších vyučujících: vybraní jako štítky, další se přidávají z nabídky
// s hledáním (tlačítko „+ Přidat vyučujícího“). Do formuláře posílá skrytá pole `name`.

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import styles from "./StaffPicker.module.css";

type Person = { id: string; name: string };

const strip = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function StaffPicker({
  name,
  staff,
  selected,
  onChange,
  exclude,
}: {
  name: string;
  staff: Person[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Kdo se nabízet nemá (hlavní vyučující) */
  exclude?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const chosen = selected.filter((id) => id !== exclude).map((id) => staff.find((s) => s.id === id)).filter((s): s is Person => !!s);
  const options = useMemo(() => {
    const q = strip(query.trim());
    return staff.filter((s) => s.id !== exclude && !selected.includes(s.id) && (!q || strip(s.name).includes(q)));
  }, [staff, exclude, selected, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div className={styles.wrap} ref={box}>
      {chosen.map((s) => (
        <input key={s.id} type="hidden" name={name} value={s.id} />
      ))}
      <div className={styles.chips}>
        {chosen.map((s) => (
          <span key={s.id} className={styles.chip}>
            {s.name}
            <button type="button" aria-label={`Odebrat ${s.name}`} onClick={() => onChange(selected.filter((x) => x !== s.id))}>
              <Icon name="close" size={16} strokeWidth={2.5} />
            </button>
          </span>
        ))}
        <button
          type="button"
          className={styles.add}
          aria-expanded={open}
          onClick={() => {
            setQuery("");
            setOpen((o) => !o);
          }}
        >
          <Icon name="plus" size={16} />
          Přidat vyučujícího
        </button>
      </div>
      {open && (
        <div
          className={styles.popover}
          role="dialog"
          aria-label="Vybrat vyučujícího"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <label className={styles.search}>
            <Icon name="search" size={16} />
            <span className="sr-only">Hledat vyučujícího</span>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hledat jméno…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (options[0]) {
                    onChange([...selected, options[0].id]);
                    setOpen(false);
                  }
                }
              }}
            />
          </label>
          <ul className={styles.list}>
            {options.length === 0 && <li className={styles.empty}>Nikdo další.</li>}
            {options.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={styles.option}
                  onClick={() => {
                    onChange([...selected, s.id]);
                    setOpen(false);
                  }}
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
