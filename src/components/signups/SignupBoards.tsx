"use client";

// Záložka Rozdělení v expedici: pokoje, vaření, úklid… Vyučující vypíše
// možnosti s kapacitou, studenti se sami přihlásí; vyučující může kohokoli
// zapsat, přesunout nebo odebrat. Obsazenost se obnovuje živě.

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Icon } from "../Icon";
import { Avatar, profileHref } from "../PageHeader";
import { toneFor, type Person } from "../classroom/people";
import {
  assignStudent,
  deleteBoard,
  joinOption,
  leaveOption,
  setBoardLocked,
  unassignStudent,
  type SignupResult,
} from "@/lib/actions/signups";
import { boardOpen, formatDay, type SignupBoard, type SignupOption } from "@/lib/signups";
import { createClient } from "@/lib/supabase/client";
import { formatDue, nowMs } from "@/lib/time";
import { BoardEditor } from "./BoardEditor";
import styles from "./signups.module.css";

export type SignupsView = {
  boards: SignupBoard[];
  /** Dny výjezdu („rrrr-mm-dd“) pro služby po dnech */
  days: string[];
};

export function SignupBoards({
  view,
  me,
  students,
  canManage,
  activitySlug,
  live,
}: {
  view: SignupsView;
  me: Person;
  students: Person[];
  canManage: boolean;
  activitySlug: string;
  live: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<SignupBoard | "new" | null>(null);

  // Někdo se přihlásil / odhlásil → načíst obsazenost znovu.
  useEffect(() => {
    if (!live || view.boards.length === 0) return;
    const sb = createClient();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = sb.channel(`rozdeleni-${activitySlug}`).on("postgres_changes", { event: "*", schema: "public", table: "signup_entries" }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    });
    void sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) sb.realtime.setAuth(data.session.access_token);
      channel.subscribe();
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      void sb.removeChannel(channel);
    };
  }, [live, activitySlug, router, view.boards.length]);

  if (editing) {
    return (
      <BoardEditor
        board={editing === "new" ? null : editing}
        days={view.days}
        activitySlug={activitySlug}
        live={live}
        onDone={() => setEditing(null)}
      />
    );
  }

  return (
    <div className={styles.stack}>
      {canManage && (
        <div className={styles.toolbar}>
          <p className={styles.muted}>
            Vypiš pokoje, služby nebo práce s kapacitou a studenti se sami přihlásí. Kohokoli můžeš i zapsat ručně.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
            <Icon name="plus" size={16} strokeWidth={2.6} /> Nové rozdělení
          </button>
        </div>
      )}
      {view.boards.length === 0 && (
        <div className={`card ${styles.empty}`}>
          {canManage ? "Zatím tu nic není. Založ třeba rozdělení pokojů nebo vaření po dnech." : "Vyučující zatím nic k rozdělení nevypsal(a)."}
        </div>
      )}
      {view.boards.map((b) => (
        <BoardCard key={b.id} board={b} me={me} students={students} canManage={canManage} onEdit={() => setEditing(b)} />
      ))}
      {!live && <p className={styles.muted}>Ukázkový režim: přihlášky se neukládají.</p>}
    </div>
  );
}

function BoardCard({
  board,
  me,
  students,
  canManage,
  onEdit,
}: {
  board: SignupBoard;
  me: Person;
  students: Person[];
  canManage: boolean;
  onEdit: () => void;
}) {
  const [msg, setMsg] = useState<SignupResult>({});
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const open = boardOpen(board, nowMs());
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const mine = board.options.filter((o) => o.studentIds.includes(me.id));
  const signedUp = new Set(board.options.flatMap((o) => o.studentIds));
  const missing = students.filter((s) => !signedUp.has(s.id));
  const hasDays = board.options.some((o) => o.day);

  const run = (fn: () => Promise<SignupResult>) =>
    start(async () => {
      const res = await fn();
      setMsg(res);
    });

  // Přesun při limitu 1: odhlásit z dosavadní a přihlásit na novou.
  const move = (to: SignupOption) =>
    run(async () => {
      for (const o of mine) {
        const res = await leaveOption(o.id);
        if (res.error) return res;
      }
      return joinOption(to.id);
    });

  // Seskupení podle dnů (služby po dnech), jinak jeden seznam.
  const groups: { day: string | null; options: SignupOption[] }[] = [];
  for (const o of board.options) {
    const last = groups.at(-1);
    if (last && last.day === o.day) last.options.push(o);
    else groups.push({ day: o.day, options: [o] });
  }

  return (
    <section className={`card ${styles.board}`} aria-label={board.title}>
      <header className={styles.boardHead}>
        <div className={styles.grow}>
          <h2 className={styles.boardTitle}>{board.title}</h2>
          <div className={styles.chips}>
            {open ? (
              <span className="chip chip-ok">{board.closesAt ? `Přihlašování do ${formatDue(board.closesAt)}` : "Přihlašování otevřené"}</span>
            ) : (
              <span className="chip chip-info">Přihlašování uzavřené</span>
            )}
            {board.required && <span className="chip chip-wait">Přihlásit se má každý</span>}
            {board.maxPerStudent > 1 && <span className="chip chip-info">Až {board.maxPerStudent} možnosti na studenta</span>}
            {!board.showNames && <span className="chip chip-info">Jména vidí jen vyučující</span>}
          </div>
        </div>
        {canManage && (
          <div className={styles.manage}>
            <button type="button" className={styles.small} onClick={onEdit}>
              <Icon name="edit" size={14} /> Upravit
            </button>
            <button type="button" className={styles.small} disabled={pending} onClick={() => run(() => setBoardLocked(board.id, !board.locked))}>
              {board.locked ? "Otevřít přihlašování" : "Uzavřít přihlašování"}
            </button>
            {confirmDelete ? (
              <>
                <button type="button" className={styles.smallDanger} disabled={pending} onClick={() => run(() => deleteBoard(board.id))}>
                  Opravdu smazat
                </button>
                <button type="button" className={styles.small} onClick={() => setConfirmDelete(false)}>
                  Ne
                </button>
              </>
            ) : (
              <button type="button" className={styles.small} onClick={() => setConfirmDelete(true)} aria-label={`Smazat ${board.title}`}>
                <Icon name="trash" size={14} />
              </button>
            )}
          </div>
        )}
      </header>

      {board.description && <p className={styles.description}>{board.description}</p>}

      {!canManage && (
        <p className={styles.mine} data-missing={mine.length === 0 && board.required}>
          {mine.length > 0
            ? `Jsi přihlášený: ${mine.map((o) => (o.day ? `${formatDay(o.day)} · ${o.label}` : o.label)).join(", ")}`
            : board.required
              ? "Ještě nejsi přihlášený — vyber si níž."
              : "Zatím nejsi nikde přihlášený."}
        </p>
      )}

      {msg.error && (
        <p role="alert" className={styles.error}>
          {msg.error}
        </p>
      )}

      <div className={styles.groups}>
        {groups.map((g, gi) => (
          <div key={`${g.day ?? "x"}-${gi}`} className={styles.group}>
            {hasDays && <h3 className={styles.dayTitle}>{g.day ? formatDay(g.day) : "Bez dne"}</h3>}
            <ul className={styles.options}>
              {g.options.map((o) => (
                <OptionRow
                  key={o.id}
                  option={o}
                  board={board}
                  me={me}
                  byId={byId}
                  students={students}
                  canManage={canManage}
                  open={open}
                  mineCount={mine.length}
                  pending={pending}
                  onJoin={() => (board.maxPerStudent === 1 && mine.length > 0 ? move(o) : run(() => joinOption(o.id)))}
                  onLeave={() => run(() => leaveOption(o.id))}
                  onAssign={(sid) => run(() => assignStudent(o.id, sid))}
                  onUnassign={(sid) => run(() => unassignStudent(o.id, sid))}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {canManage && board.required && (
        <p className={styles.missing}>
          {missing.length === 0 ? (
            "Přihlášení jsou všichni."
          ) : (
            <>
              <strong>Ještě nepřihlášení ({missing.length}):</strong> {missing.map((s) => s.name).join(", ")}
            </>
          )}
        </p>
      )}
    </section>
  );
}

function OptionRow({
  option,
  board,
  me,
  byId,
  students,
  canManage,
  open,
  mineCount,
  pending,
  onJoin,
  onLeave,
  onAssign,
  onUnassign,
}: {
  option: SignupOption;
  board: SignupBoard;
  me: Person;
  byId: Map<string, Person>;
  students: Person[];
  canManage: boolean;
  open: boolean;
  mineCount: number;
  pending: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onAssign: (studentId: string) => void;
  onUnassign: (studentId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const pick = useRef<HTMLSelectElement>(null);
  const isMine = option.studentIds.includes(me.id);
  const full = option.capacity !== null && option.taken >= option.capacity;
  const over = option.capacity !== null && option.taken > option.capacity;
  const canMove = board.maxPerStudent === 1 && mineCount > 0;
  const limitReached = board.maxPerStudent > 1 && mineCount >= board.maxPerStudent;
  const hiddenOthers = option.taken - option.studentIds.length;
  const candidates = students.filter((s) => !option.studentIds.includes(s.id));

  return (
    <li className={styles.option} data-mine={isMine} data-full={full}>
      <div className={styles.optionMain}>
        <div className={styles.optionTop}>
          <span className={styles.optionLabel}>{option.label}</span>
          <span className={styles.count} data-over={over}>
            {option.capacity !== null ? `${option.taken} / ${option.capacity}` : `${option.taken} přihlášen${option.taken === 1 ? "ý" : "ých"}`}
          </span>
        </div>
        {option.capacity !== null && (
          <div className={styles.bar} aria-hidden="true">
            <div style={{ width: `${Math.min(100, Math.round((option.taken / option.capacity) * 100))}%` }} data-full={full} />
          </div>
        )}
        {(option.studentIds.length > 0 || hiddenOthers > 0) && (
          <div className={styles.people}>
            {option.studentIds.map((sid) => {
              const p = byId.get(sid) ?? { id: sid, name: "Student", initials: "?", role: "student" as const };
              return (
                <span key={sid} className={styles.person} data-me={sid === me.id}>
                  <Avatar initials={p.initials} size={24} tone={toneFor(p, me.id)} href={profileHref(p.id)} title={p.name} />
                  {sid === me.id ? "Ty" : p.name.split(" ")[0] + (p.name.split(" ").length > 1 ? ` ${p.name.split(" ").at(-1)![0]}.` : "")}
                  {canManage && (
                    <button type="button" className={styles.remove} disabled={pending} onClick={() => onUnassign(sid)} aria-label={`Odebrat ${p.name}`}>
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </span>
              );
            })}
            {hiddenOthers > 0 && <span className={styles.muted}>+ {hiddenOthers} {hiddenOthers === 1 ? "další" : "dalších"}</span>}
          </div>
        )}
        {canManage && adding && (
          <div className={styles.assign}>
            <select ref={pick} className={styles.select} defaultValue="" aria-label={`Zapsat studenta: ${option.label}`}>
              <option value="" disabled>
                Vyber studenta…
              </option>
              {candidates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.small}
              disabled={pending}
              onClick={() => {
                const v = pick.current?.value;
                if (v) onAssign(v);
                setAdding(false);
              }}
            >
              Zapsat
            </button>
            <button type="button" className={styles.small} onClick={() => setAdding(false)}>
              Zrušit
            </button>
          </div>
        )}
      </div>
      <div className={styles.optionActions}>
        {canManage ? (
          !adding && (
            <button type="button" className={styles.small} onClick={() => setAdding(true)} disabled={candidates.length === 0}>
              <Icon name="plus" size={14} /> Zapsat
            </button>
          )
        ) : isMine ? (
          <button type="button" className={styles.small} disabled={pending || !open} onClick={onLeave}>
            Odhlásit se
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            style={{ minHeight: 38, padding: "0 14px" }}
            disabled={pending || !open || full || limitReached}
            onClick={onJoin}
          >
            {full ? "Plno" : canMove ? "Přesunout sem" : "Přihlásit se"}
          </button>
        )}
      </div>
    </li>
  );
}
