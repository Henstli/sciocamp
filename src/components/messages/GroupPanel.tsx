"use client";

// Skupinové chaty: založení skupiny a panel se seznamem členů.
// Správce skupinu přejmenuje, přidá a odebere členy, jmenuje správce a skupinu
// smaže; každý ji může opustit. Oprávnění hlídají RPC v databázi.

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Icon } from "../Icon";
import { Avatar, profileHref } from "../PageHeader";
import {
  addGroupMembers,
  createGroup,
  deleteGroup,
  leaveGroup,
  removeGroupMember,
  renameGroup,
  setGroupAdmin,
} from "@/lib/actions/communication";
import type { Role } from "@/lib/types";
import type { ContactView, GroupView } from "./Messenger";
import styles from "./messages.module.css";

const tone = (role: Role) => (role === "student" ? ("student" as const) : ("late" as const));
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("cs");

/** Hledání lidí se zaškrtáváním (pro novou skupinu i přidání členů). */
function PeoplePicker({
  people,
  picked,
  onToggle,
  exclude = [],
}: {
  people: ContactView[];
  picked: string[];
  onToggle: (id: string) => void;
  exclude?: string[];
}) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return people.filter((p) => !exclude.includes(p.id) && (!q || fold(p.name).includes(q))).slice(0, 60);
  }, [people, query, exclude]);
  const chosen = people.filter((p) => picked.includes(p.id));

  return (
    <div className={styles.picker}>
      {chosen.length > 0 && (
        <div className={styles.chips}>
          {chosen.map((p) => (
            <span key={p.id} className={styles.chip}>
              {p.name}
              <button type="button" onClick={() => onToggle(p.id)} aria-label={`Odebrat ${p.name}`}>
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <label className={styles.search}>
        <Icon name="search" size={18} />
        <span className="sr-only">Hledat lidi</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hledat lidi…" type="search" />
      </label>
      <ul className={styles.pickList}>
        {shown.length === 0 && <li className={styles.empty}>Nikoho takového nenacházím.</li>}
        {shown.map((p) => (
          <li key={p.id}>
            <label className={styles.pickRow}>
              <input type="checkbox" checked={picked.includes(p.id)} onChange={() => onToggle(p.id)} />
              <Avatar presence initials={p.initials} userId={p.id} size={34} tone={tone(p.role)} />
              <span className={styles.rowMain}>
                <span className={styles.rowName}>{p.name}</span>
                <span className={styles.rowPreview}>{p.caption}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

/** Pravý panel: založení nové skupiny. */
export function NewGroupForm({ people, live, onCancel }: { people: ContactView[]; live: boolean; onCancel: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await createGroup(title, picked);
      if (res.error || !res.id) return setError(res.error ?? "Skupinu se nepodařilo založit.");
      onCancel();
      router.push(`/zpravy?k=${res.id}`, { scroll: false });
    });

  return (
    <form
      className={styles.groupForm}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <header className={styles.panelHead}>
        <button type="button" className={styles.headIcon} onClick={onCancel} aria-label="Zpět">
          <Icon name="chevronLeft" size={20} />
        </button>
        <h2 className={styles.panelTitle}>Nová skupina</h2>
      </header>
      <div className={styles.panelBody}>
        <label className={styles.field}>
          <span>Název skupiny</span>
          <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Např. Projekt Cestománie" required autoFocus />
        </label>
        <div className={styles.field}>
          <span>Členové {picked.length > 0 && `(${picked.length})`}</span>
          <PeoplePicker people={people} picked={picked} onToggle={(id) => setPicked((l) => toggleIn(l, id))} />
        </div>
      </div>
      <footer className={styles.panelFoot}>
        {error && (
          <p role="alert" className={styles.formError}>
            {error}
          </p>
        )}
        {!live && <p className={styles.formNote}>Ukázkový režim: skupina se nezaloží.</p>}
        <div className={styles.panelActions}>
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            Zrušit
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending || !title.trim() || picked.length < 2}>
            {pending ? "Zakládám…" : "Založit skupinu"}
          </button>
        </div>
        {picked.length < 2 && <p className={styles.formNote}>Vyber aspoň dva lidi. Ty budeš správce skupiny.</p>}
      </footer>
    </form>
  );
}

/** Panel skupiny: název, členové, správci, přidání, odchod a smazání. */
export function GroupPanel({ group, people, live }: { group: GroupView; people: ContactView[]; live: boolean }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(group.title);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<null | "leave" | "delete" | { remove: string }>(null);
  const [msg, setMsg] = useState<{ error?: string; info?: string }>({});
  const [pending, start] = useTransition();
  const admin = group.meAdmin;
  const memberIds = group.members.map((m) => m.id);

  const run = (action: () => Promise<{ error?: string }>, after?: () => void) =>
    start(async () => {
      setMsg({});
      const res = await action();
      if (res.error) return setMsg({ error: res.error });
      after?.();
    });

  const leaveOrDelete = (kind: "leave" | "delete") =>
    run(
      () => (kind === "leave" ? leaveGroup(group.id) : deleteGroup(group.id)),
      () => {
        router.push("/zpravy");
        router.refresh();
      },
    );

  return (
    <div className={styles.groupPanel} role="region" aria-label="Členové a nastavení skupiny">
      <div className={styles.panelBody}>
        {/* Název */}
        {renaming ? (
          <form
            className={styles.inlineForm}
            onSubmit={(e) => {
              e.preventDefault();
              run(() => renameGroup(group.id, title), () => setRenaming(false));
            }}
          >
            <label className={styles.grow}>
              <span className="sr-only">Název skupiny</span>
              <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} autoFocus />
            </label>
            <button type="submit" className="btn btn-primary" disabled={pending || !title.trim()}>
              Uložit
            </button>
            <button type="button" className="btn btn-outline" onClick={() => (setRenaming(false), setTitle(group.title))}>
              Zrušit
            </button>
          </form>
        ) : (
          <div className={styles.groupName}>
            <strong>{group.title}</strong>
            {admin && (
              <button type="button" className={styles.linkBtn} onClick={() => setRenaming(true)}>
                <Icon name="edit" size={16} /> Přejmenovat
              </button>
            )}
          </div>
        )}

        {/* Členové */}
        <div className={styles.membersHead}>
          <h3>Členové ({group.members.length})</h3>
          {admin && !adding && (
            <button type="button" className="btn btn-outline" onClick={() => setAdding(true)}>
              <Icon name="plus" size={16} /> Přidat členy
            </button>
          )}
        </div>

        {adding && (
          <div className={styles.addBox}>
            <PeoplePicker people={people} picked={picked} onToggle={(id) => setPicked((l) => toggleIn(l, id))} exclude={memberIds} />
            <div className={styles.panelActions}>
              <button type="button" className="btn btn-outline" onClick={() => (setAdding(false), setPicked([]))}>
                Zrušit
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || picked.length === 0}
                onClick={() => run(() => addGroupMembers(group.id, picked), () => (setAdding(false), setPicked([])))}
              >
                Přidat {picked.length > 0 && `(${picked.length})`}
              </button>
            </div>
          </div>
        )}

        <ul className={styles.memberList}>
          {group.members.map((m) => (
            <li key={m.id} className={styles.memberRow}>
              <Avatar presence initials={m.initials} size={38} tone={m.me ? "me" : tone(m.role)} href={m.id ? profileHref(m.id) : undefined} title={m.name} />
              <span className={styles.rowMain}>
                <span className={styles.rowName}>
                  {m.name}
                  {m.me && <span className={styles.muted}> (ty)</span>}
                </span>
                <span className={styles.rowPreview}>{m.caption}</span>
              </span>
              {m.isAdmin && <span className={styles.adminChip}>Správce</span>}
              {admin && !m.me && (
                <span className={styles.memberActions}>
                  <button
                    type="button"
                    className={styles.smallBtn}
                    disabled={pending}
                    onClick={() => run(() => setGroupAdmin(group.id, m.id, !m.isAdmin))}
                  >
                    {m.isAdmin ? "Odebrat správce" : "Udělat správcem"}
                  </button>
                  {confirm && typeof confirm === "object" && confirm.remove === m.id ? (
                    <>
                      <button
                        type="button"
                        className={styles.smallDanger}
                        disabled={pending}
                        onClick={() => run(() => removeGroupMember(group.id, m.id), () => setConfirm(null))}
                      >
                        Opravdu odebrat
                      </button>
                      <button type="button" className={styles.smallBtn} onClick={() => setConfirm(null)}>
                        Ne
                      </button>
                    </>
                  ) : (
                    <button type="button" className={styles.smallBtn} onClick={() => setConfirm({ remove: m.id })} aria-label={`Odebrat ${m.name} ze skupiny`}>
                      Odebrat
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <footer className={styles.panelFoot}>
        {msg.error && (
          <p role="alert" className={styles.formError}>
            {msg.error}
          </p>
        )}
        {!live && <p className={styles.formNote}>Ukázkový režim: změny se neukládají.</p>}
        {confirm === "leave" || confirm === "delete" ? (
          <div className={styles.confirmBox}>
            <p>
              {confirm === "leave"
                ? "Opravdu chceš skupinu opustit? Zprávy už neuvidíš, dokud tě někdo nepřidá zpátky."
                : "Opravdu smazat skupinu? Smažou se všechny zprávy a přílohy pro všechny členy. Nejde to vrátit."}
            </p>
            <div className={styles.panelActions}>
              <button type="button" className="btn btn-outline" onClick={() => setConfirm(null)}>
                Zpět
              </button>
              <button type="button" className={`btn ${styles.dangerBtn}`} disabled={pending} onClick={() => leaveOrDelete(confirm)}>
                {confirm === "leave" ? "Opustit skupinu" : "Smazat skupinu"}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.panelActions}>
            <button type="button" className="btn btn-outline" onClick={() => setConfirm("leave")}>
              <Icon name="logout" size={16} /> Opustit skupinu
            </button>
            {admin && (
              <button type="button" className={`btn ${styles.dangerOutline}`} onClick={() => setConfirm("delete")}>
                <Icon name="trash" size={16} /> Smazat skupinu
              </button>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}
