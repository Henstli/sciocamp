"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import styles from "./ukoly.module.css";

export type TaskRow = {
  id: string;
  title: string;
  course: string;
  /** Termín nebo stav („zítra 23:59“, „odevzdáno 17. 10.“) */
  meta: string;
  /** Klíč filtru, do kterého řádek patří */
  group: string;
  tone: "ok" | "wait" | "late" | "info" | "primary";
  chip: string;
  action: string;
  primary?: boolean;
  danger?: boolean;
};

const TONE_ICON: Record<TaskRow["tone"], IconName> = {
  ok: "tick",
  wait: "clock",
  late: "alert",
  info: "file",
  primary: "check",
};

// Hledání bez ohledu na diakritiku a velikost písmen.
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function TaskList({
  rows,
  filters,
  empty,
}: {
  rows: TaskRow[];
  filters: { key: string; label: string; dot?: string }[];
  empty: string;
}) {
  const [filter, setFilter] = useState("vse");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { vse: rows.length };
    for (const r of rows) c[r.group] = (c[r.group] ?? 0) + 1;
    return c;
  }, [rows]);

  const shown = rows.filter(
    (r) => (filter === "vse" || r.group === filter) && (!query.trim() || fold(`${r.title} ${r.course}`).includes(fold(query.trim()))),
  );

  return (
    <>
      <div className={styles.toolbar}>
        <div role="tablist" aria-label="Filtr úkolů" className="tablist">
          {filters.map((f) => (
            <button key={f.key} role="tab" aria-selected={filter === f.key} className={`tab ${styles.filter}`} onClick={() => setFilter(f.key)}>
              {f.dot && <span className={styles.dot} style={{ background: f.dot }} />}
              {f.label}
              <span className={styles.count}>{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <label className={styles.search}>
          <Icon name="search" size={18} />
          <input type="search" aria-label="Hledat úkol" placeholder="Hledat úkol…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <section aria-label="Seznam úkolů" className={`card ${styles.list}`}>
        {shown.map((r) => (
          <Link key={r.id} href={`/ukoly/${r.id}`} className={styles.row}>
            <span className={styles.icon} data-tone={r.tone}>
              <Icon name={TONE_ICON[r.tone]} size={18} strokeWidth={2.2} />
            </span>
            <span className={styles.main}>
              <span className={styles.title}>{r.title}</span>
              <span className={styles.course}>{r.course}</span>
            </span>
            <span className={styles.meta}>{r.meta}</span>
            <span className={`chip chip-${r.tone}`}>{r.chip}</span>
            <span className={`${styles.action} ${r.primary ? styles.actionPrimary : ""} ${r.danger ? styles.actionDanger : ""}`}>
              {r.action}
            </span>
          </Link>
        ))}
        {shown.length === 0 && <div className={styles.empty}>{rows.length === 0 ? empty : "V této kategorii nic není."}</div>}
      </section>
    </>
  );
}
