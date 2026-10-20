"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon, type IconName } from "@/components/Icon";
import { KIND_LABEL, searchItems, type SearchItem, type SearchKind } from "@/lib/search";
import styles from "./search.module.css";

const ICON: Record<SearchKind, IconName> = {
  activity: "book",
  assignment: "check",
  person: "users",
  proposal: "bulb",
  wish: "vote",
  help: "help",
  page: "chevronRight",
};
const ACTIVITY_ICON: Record<string, IconName> = { kurz: "book", atelier: "shapes", ostatni: "calendar", expedice: "mountain" };

/** Vyhledávání na Domově: výsledky hned při psaní, šipky + Enter, Esc zavře. Klávesa „/“ skočí do pole. */
export function HomeSearch({ items }: { items: SearchItem[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  const groups = useMemo(() => searchItems(items, query), [items, query]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const current = Math.min(active, Math.max(flat.length - 1, 0));

  // „/“ kdekoli na stránce skočí do vyhledávání.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Klik mimo zavře nabídku.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (item: SearchItem) => {
    setOpen(false);
    setQuery("");
    router.push(item.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flat[current]) {
      e.preventDefault();
      go(flat[current]);
    } else if (e.key === "Escape") {
      setOpen(false);
      input.current?.blur();
    }
  };

  const show = open && query.trim().length > 0;
  let index = -1;
  return (
    <div ref={box} className={styles.wrap}>
      <label className={styles.field}>
        <Icon name="search" size={18} />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-label="Hledat"
          aria-expanded={show}
          aria-controls={listId}
          aria-activedescendant={show && flat[current] ? `${listId}-${current}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Hledat kurzy, úkoly, lidi…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <kbd className={styles.kbd} aria-hidden="true">
          /
        </kbd>
      </label>
      {show && (
        <div id={listId} role="listbox" aria-label="Výsledky hledání" className={styles.panel}>
          {groups.length === 0 ? (
            <p className={styles.empty}>Nic nenalezeno. Hledej název aktivity, úkolu, jméno člověka nebo stránku.</p>
          ) : (
            groups.map((g) => (
              <div key={g.kind} role="group" aria-label={KIND_LABEL[g.kind]}>
                <div className={styles.groupTitle}>{KIND_LABEL[g.kind]}</div>
                {g.items.map((item) => {
                  index++;
                  const i = index;
                  return (
                    <div
                      key={item.href}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === current}
                      className={styles.option}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        go(item);
                      }}
                    >
                      {item.kind === "person" ? (
                        <Avatar initials={initials(item.title)} userId={item.userId} size={32} />
                      ) : (
                        <span className={styles.icon} data-kind={item.tone ?? item.kind}>
                          <Icon name={item.tone ? (ACTIVITY_ICON[item.tone] ?? ICON[item.kind]) : ICON[item.kind]} size={16} />
                        </span>
                      )}
                      <span className={styles.text}>
                        <span className={styles.title}>{item.title}</span>
                        <span className={styles.sub}>{item.sub}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
