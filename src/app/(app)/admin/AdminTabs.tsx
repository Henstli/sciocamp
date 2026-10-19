"use client";

import { keepForm } from "@/lib/use-keep-form";
import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/PageHeader";
import { changeRole, inviteUser, renameUser, type InviteState } from "@/lib/actions/users";
import type { ActivityKind, Role } from "@/lib/types";
import styles from "./admin.module.css";

type AdminUser = { id: string; name: string; email: string; role: Role; group: string; active: boolean; initials: string };
type AdminCourse = {
  id: string;
  /** Adresa třídy (detail) */
  href: string;
  /** Už proběhlo */
  ended: boolean;
  kind: string;
  kindKey: ActivityKind;
  title: string;
  lector: string;
  when: string;
  taken: number;
  cap: number | null;
  meetUrl: string | null;
};

/** Záložky s aktivitami podle druhu. */
const KIND_TABS = [
  ["kurz", "Kurzy"],
  ["atelier", "Ateliéry"],
  ["ostatni", "Události"],
  ["expedice", "Expedice"],
] as const;
type TabKey = "users" | "periods" | (typeof KIND_TABS)[number][0];

const KIND_WORDS: Record<ActivityKind, { title: string; add: string; empty: string; past: string }> = {
  kurz: { title: "Všechny kurzy", add: "+ Nový kurz", empty: "Zatím tu není žádný kurz.", past: "Proběhlé kurzy" },
  atelier: { title: "Všechny ateliéry", add: "+ Nový ateliér", empty: "Zatím tu není žádný ateliér.", past: "Proběhlé ateliéry" },
  ostatni: { title: "Všechny události", add: "+ Nová událost", empty: "Zatím tu není žádná událost.", past: "Proběhlé události" },
  expedice: { title: "Všechny expedice", add: "+ Nová expedice", empty: "Zatím tu není žádná expedice.", past: "Proběhlé expedice" },
};

const FILTERS = [
  ["all", "Všichni"],
  ["student", "Studenti"],
  ["ucitel", "Učitelé"],
  ["admin", "Admini"],
] as const;

// Porovnání bez diakritiky, aby "simon" našlo "Šimon".
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function AdminTabs({
  users,
  courses,
  live,
  initialTab = "users",
  periodsTab,
}: {
  users: AdminUser[];
  courses: AdminCourse[];
  live: boolean;
  initialTab?: TabKey;
  /** Obsah záložky Kurzová období (vykreslený na serveru) */
  periodsTab?: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [query, setQuery] = useState("");
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [roleMsg, setRoleMsg] = useState<{ error?: string; info?: string }>({});
  const [, startTransition] = useTransition();
  const [inviting, setInviting] = useState(false);

  const onRole = (id: string, role: Role, previous: Role) => {
    setRoles((r) => ({ ...r, [id]: role }));
    startTransition(async () => {
      const res = await changeRole(id, role);
      setRoleMsg(res);
      if (res.error) setRoles((r) => ({ ...r, [id]: previous }));
    });
  };

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
        <button role="tab" aria-selected={tab === "periods"} className="tab" onClick={() => setTab("periods")}>
          Kurzová období
        </button>
        {KIND_TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className="tab" onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "users" && !inviting && (
        <button type="button" className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => setInviting(true)}>
          + Přidat uživatele
        </button>
      )}
      {tab === "users" && inviting && <InviteForm live={live} onClose={() => setInviting(false)} />}

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
                    <NameCell user={u} />
                  </div>
                  <select
                    aria-label={`Role uživatele ${u.name}`}
                    value={u.role}
                    onChange={(e) => onRole(u.id, e.target.value as Role, u.role)}
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
          <div className={styles.footer} role="status">
            Zobrazeno {shown.length} z {users.length} uživatelů
            {changed && roleMsg.error && <span className={styles.msgError}> · {roleMsg.error}</span>}
            {changed && !roleMsg.error && roleMsg.info && ` · ${roleMsg.info}`}
          </div>
        </section>
      )}

      {tab === "periods" && periodsTab}

      {KIND_TABS.map(([key]) =>
        tab === key ? <ActivityList key={key} kind={key} items={courses.filter((c) => c.kindKey === key)} /> : null,
      )}
    </>
  );
}

function InviteForm({ live, onClose }: { live: boolean; onClose: () => void }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteUser, {});
  const [role, setRole] = useState<Role>("student");
  return (
    <form onSubmit={keepForm(action)} className={`card ${styles.invite}`}>
      <div className={styles.inviteHead}>
        <h2 className="section-title">Přidat uživatele</h2>
        <button type="button" className="btn btn-outline" style={{ marginLeft: "auto", minHeight: 40 }} onClick={onClose}>
          Zavřít
        </button>
      </div>
      <p className={styles.inviteNote}>
        Na školní e-mail přijde pozvánka s odkazem na nastavení hesla. Přihlásit se pak může i přes Google.
        {!live && " (Ukázkový režim: pozvánka se neodešle.)"}
      </p>
      <div className={styles.inviteGrid}>
        <label className={styles.field}>
          Celé jméno
          <input name="fullName" required autoComplete="off" className={styles.textInput} />
        </label>
        <label className={styles.field}>
          Školní e-mail
          <input name="email" type="email" required placeholder="jmeno.prijmeni@scioskola.cz" autoComplete="off" className={styles.textInput} />
        </label>
        <label className={styles.field}>
          Role
          <select name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} className={styles.select}>
            <option value="student">Student</option>
            <option value="ucitel">Učitel</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        {role === "student" ? (
          <label className={styles.field}>
            Ročník
            <select name="grade" defaultValue="" className={styles.select} required>
              <option value="" disabled>
                Vyber…
              </option>
              {[1, 2, 3, 4].map((g) => (
                <option key={g} value={g}>
                  {g}. ročník
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className={styles.field}>
            Úvazek / popisek
            <input name="staffNote" placeholder="Např. Plný úvazek" className={styles.textInput} />
          </label>
        )}
      </div>
      {(state.error || state.info) && (
        <p role="status" className={state.error ? styles.msgError : styles.inviteNote}>
          {state.error ?? state.info}
        </p>
      )}
      <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={pending}>
        {pending ? "Odesílám…" : "Poslat pozvánku"}
      </button>
    </form>
  );
}

/** Jméno uživatele s možností úpravy (tužka → pole → Uložit). */
function NameCell({ user: u }: { user: { id: string; name: string; email: string } }) {
  const placeholderName = u.name === u.email.split("@")[0];
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(placeholderName ? "" : u.name);
  const [msg, setMsg] = useState<{ error?: string; info?: string }>({});
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const res = await renameUser(u.id, value);
      setMsg(res);
      if (!res.error) setEditing(false);
    });
  if (editing) {
    return (
      <form
        className={styles.nameForm}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Jméno Příjmení"
          aria-label={`Jméno a příjmení: ${u.email}`}
          className={styles.textInput}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        />
        <button type="submit" className="btn btn-primary" disabled={pending} style={{ minHeight: 40 }}>
          {pending ? "…" : "Uložit"}
        </button>
        <button type="button" className="btn btn-outline" style={{ minHeight: 40 }} onClick={() => setEditing(false)}>
          Zrušit
        </button>
        {msg.error && <span className={styles.msgError}>{msg.error}</span>}
      </form>
    );
  }
  return (
    <div className={styles.personText}>
      <div className={styles.nameLine}>
        <span className={styles.name} data-missing={placeholderName || undefined}>
          {placeholderName ? "Bez jména" : u.name}
        </span>
        <button type="button" className={styles.editName} onClick={() => setEditing(true)} aria-label={`Upravit jméno: ${u.email}`} title="Upravit jméno">
          <Icon name="edit" size={14} />
        </button>
      </div>
      <div className={styles.email}>
        {u.email}
        {msg.info && <span className={styles.savedNote}> · {msg.info}</span>}
      </div>
    </div>
  );
}

/** Admin: všechny aktivity jednoho druhu (běžící a nadcházející, proběhlé sbalené). */
function ActivityList({ kind, items }: { kind: ActivityKind; items: AdminCourse[] }) {
  const w = KIND_WORDS[kind];
  const [query, setQuery] = useState("");
  const q = fold(query.trim());
  const match = (c: AdminCourse) => !q || fold(c.title).includes(q) || fold(c.lector).includes(q);
  const current = items.filter((c) => !c.ended && match(c));
  const past = items.filter((c) => c.ended && match(c));
  return (
    <section aria-label={w.title} className={`card ${styles.table}`}>
      <div className={styles.toolbar}>
        <h2 className="section-title">
          {w.title} · {items.filter((c) => !c.ended).length}
        </h2>
        <label className={styles.search} style={{ marginLeft: "auto" }}>
          <Icon name="search" size={18} />
          <input type="search" aria-label="Hledat" placeholder="Hledat název nebo vyučujícího…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <Link href={`/ucitel/nova?typ=${kind}`} className="btn btn-primary" style={{ minHeight: 40 }}>
          {w.add}
        </Link>
      </div>
      {current.length === 0 && (
        <p className={styles.inviteNote} style={{ padding: "16px 20px" }}>
          {q ? "Nic takového tu není." : w.empty}
        </p>
      )}
      {current.map((c) => (
        <ActivityRow key={c.id} c={c} />
      ))}
      {past.length > 0 && (
        <details className={styles.pastList}>
          <summary>
            {w.past} ({past.length})
          </summary>
          {past.map((c) => (
            <ActivityRow key={c.id} c={c} />
          ))}
        </details>
      )}
    </section>
  );
}

function ActivityRow({ c }: { c: AdminCourse }) {
  const full = c.cap !== null && c.taken >= c.cap;
  return (
    <div className={styles.courseRow}>
      <div className={styles.courseMain}>
        <Link href={c.href} className={styles.name} style={{ color: "inherit", display: "block" }}>
          {c.title}
        </Link>
        <div className={styles.email}>{[c.lector, c.when].filter(Boolean).join(" · ")}</div>
      </div>
      <div className={styles.capacity}>
        <div className={styles.capLabel}>{c.cap !== null ? `${c.taken} / ${c.cap} míst` : `${c.taken} studentů`}</div>
        {c.cap !== null && (
          <div className={styles.capBar}>
            <div style={{ width: `${Math.min(100, Math.round((c.taken / c.cap) * 100))}%` }} data-full={full} />
          </div>
        )}
      </div>
      {c.meetUrl ? (
        <a href={c.meetUrl} target="_blank" rel="noopener noreferrer" className="chip chip-ok" style={{ textDecoration: "none" }}>
          Meet připraven
        </a>
      ) : (
        <span className="chip chip-wait">Bez Meetu</span>
      )}
      <Link href={c.href} className="btn btn-outline" style={{ minHeight: 36, padding: "0 12px" }}>
        Otevřít
      </Link>
      <Link href={`/ucitel/${c.id}`} className="btn btn-outline" style={{ minHeight: 36, padding: "0 12px" }}>
        Upravit
      </Link>
    </div>
  );
}
