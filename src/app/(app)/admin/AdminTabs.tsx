"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/PageHeader";
import type { ActivityKind, Role } from "@/lib/types";
import styles from "./admin.module.css";

type AdminUser = { id: string; name: string; email: string; role: Role; group: string; active: boolean; initials: string };
type AdminCourse = {
  id: string;
  kind: string;
  kindKey: ActivityKind;
  title: string;
  lector: string;
  when: string;
  taken: number;
  cap: number;
  meetUrl: string;
};

const FILTERS = [
  ["all", "Všichni"],
  ["student", "Studenti"],
  ["ucitel", "Učitelé"],
  ["admin", "Admini"],
] as const;

// Porovnání bez diakritiky, aby "simon" našlo "Šimon".
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function AdminTabs({ users, courses }: { users: AdminUser[]; courses: AdminCourse[] }) {
  const [tab, setTab] = useState<"users" | "courses">("users");
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [query, setQuery] = useState("");
  const [roles, setRoles] = useState<Record<string, Role>>({});

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return users
      .map((u) => ({ ...u, role: roles[u.id] ?? u.role }))
      .filter((u) => filter === "all" || u.role === filter)
      .filter((u) => !q || fold(u.name).includes(q) || u.email.includes(q));
  }, [users, roles, filter, query]);

  const changed = Object.keys(roles).length > 0;

  return (
    <>
      <div role="tablist" aria-label="Sekce správy" className="tablist">
        <button role="tab" aria-selected={tab === "users"} className="tab" onClick={() => setTab("users")}>
          Uživatelé
        </button>
        <button role="tab" aria-selected={tab === "courses"} className="tab" onClick={() => setTab("courses")}>
          Kurzy a ateliéry
        </button>
      </div>

      {tab === "users" && (
        <section aria-label="Uživatelé" className={`card ${styles.table}`}>
          <div className={styles.toolbar}>
            <div className={styles.filters}>
              {FILTERS.map(([key, label]) => (
                <button key={key} aria-pressed={filter === key} className={styles.filter} onClick={() => setFilter(key)}>
                  {label}
                </button>
              ))}
            </div>
            <label className={styles.search}>
              <Icon name="search" size={18} />
              <input
                type="search"
                aria-label="Hledat uživatele"
                placeholder="Hledat jméno nebo e-mail…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className={styles.scroll}>
            <div className={styles.rows}>
              <div className={`${styles.row} ${styles.headRow}`}>
                <span>Jméno</span>
                <span>Role</span>
                <span>Ročník / úvazek</span>
                <span>Stav</span>
              </div>
              {shown.map((u) => (
                <div key={u.id} className={styles.row}>
                  <div className={styles.person}>
                    <Avatar initials={u.initials} size={36} tone={u.role} />
                    <div className={styles.personText}>
                      <div className={styles.name}>{u.name}</div>
                      <div className={styles.email}>{u.email}</div>
                    </div>
                  </div>
                  <select
                    aria-label={`Role uživatele ${u.name}`}
                    value={u.role}
                    onChange={(e) => setRoles((r) => ({ ...r, [u.id]: e.target.value as Role }))}
                    className={styles.select}
                  >
                    <option value="student">Student</option>
                    <option value="ucitel">Učitel</option>
                    <option value="admin">Admin</option>
                  </select>
                  <div className={styles.group}>{u.group}</div>
                  <span className={`chip ${u.active ? "chip-ok" : "chip-wait"}`} style={{ justifySelf: "start" }}>
                    {u.active ? "Aktivní" : "Pozvánka odeslána"}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.footer}>
            Zobrazeno {shown.length} z {users.length} uživatelů
            {changed && " · Ukázkový režim: změny rolí se uloží až po napojení databáze."}
          </div>
        </section>
      )}

      {tab === "courses" && (
        <section aria-label="Kurzy a ateliéry" className={`card ${styles.table}`}>
          <div className={styles.toolbar}>
            <h2 className="section-title">Nabídka bloku 1</h2>
          </div>
          {courses.map((c) => {
            const full = c.taken >= c.cap;
            return (
              <div key={c.id} className={styles.courseRow}>
                <span className={`chip ${c.kindKey === "atelier" ? styles.chipAtelier : "chip-primary"}`}>{c.kind}</span>
                <div className={styles.courseMain}>
                  <div className={styles.name}>{c.title}</div>
                  <div className={styles.email}>
                    {c.lector} · {c.when}
                  </div>
                </div>
                <div className={styles.capacity}>
                  <div className={styles.capLabel}>
                    {c.taken} / {c.cap} míst
                  </div>
                  <div className={styles.capBar}>
                    <div style={{ width: `${Math.min(100, Math.round((c.taken / c.cap) * 100))}%` }} data-full={full} />
                  </div>
                </div>
                <a href={c.meetUrl} target="_blank" rel="noopener noreferrer" className="chip chip-ok" style={{ textDecoration: "none" }}>
                  Meet připraven
                </a>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
