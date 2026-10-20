"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { closeWish, deleteWish, reopenWish, type ActionResult } from "@/lib/actions/proposals";
import { plural } from "@/lib/format";
import { WISH_KIND_LABEL, type Wish, type WishKind } from "@/lib/proposals";
import { VoteButton } from "./VoteButton";
import f from "@/components/manage/manage.module.css";
import styles from "@/app/(app)/navrhy/navrhy.module.css";

export type WishView = Wish & {
  authorName: string;
  when: string;
  activity: { href: string; title: string } | null;
  mine: boolean;
  /** Kolik dní ještě sbírá hlasy (null u vypsaných) */
  daysLeft: number | null;
};

const FILTERS: [WishKind | "all", string][] = [
  ["all", "Vše"],
  ["atelier", "Ateliéry"],
  ["expedice", "Expedice"],
  ["kurz", "Kurzy"],
];

const KIND_CHIP: Record<WishKind, React.CSSProperties> = {
  atelier: { background: "var(--atelier-bg)", color: "var(--atelier-text)" },
  expedice: { background: "var(--other-bg)", color: "var(--other)" },
  kurz: { background: "var(--primary-soft)", color: "var(--primary-text)" },
};

/** Seznam přání s filtrem podle druhu; vyučující u přání vypisuje a uzavírá. */
export function WishBoard({ wishes, staff }: { wishes: WishView[]; staff: boolean }) {
  const [filter, setFilter] = useState<WishKind | "all">("all");
  const shown = wishes.filter((w) => filter === "all" || w.kind === filter);
  const open = shown.filter((w) => w.status === "open");
  const done = shown.filter((w) => w.status !== "open");

  return (
    <div className={styles.list}>
      <div className={styles.filters} role="group" aria-label="Druh">
        {FILTERS.map(([key, label]) => (
          <button key={key} type="button" className={styles.filter} aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>
      {open.length === 0 ? (
        <div className="card" style={{ padding: 24 }}>
          <p className={styles.empty}>Tady zatím nic není. Co by ses chtěl(a) učit? Přidej přání vlevo.</p>
        </div>
      ) : (
        open.map((w) => <WishCard key={w.id} w={w} staff={staff} />)
      )}
      {done.length > 0 && (
        <details className={styles.closed}>
          <summary>
            {done.some((w) => w.status === "uzavreno") ? "Schválené a uzavřené" : "Schválené"} <span>{done.length}</span>
          </summary>
          <div className={styles.closedList}>
            {done.map((w) => (
              <WishCard key={w.id} w={w} staff={staff} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function WishCard({ w, staff }: { w: WishView; staff: boolean }) {
  const open = w.status === "open";
  return (
    <article className={`card ${styles.item}`} data-closed={!open} data-vote="arrow" id={`prani-${w.id}`}>
      <VoteButton id={w.id} kind="wish" count={w.voteCount} on={w.voted} disabled={!open} label="chci to" />
      <div className={styles.body}>
        <div className={styles.chips}>
          <span className="chip" style={KIND_CHIP[w.kind]}>
            {WISH_KIND_LABEL[w.kind]}
          </span>
          {w.status === "vypsano" && <span className="chip chip-ok">Schváleno</span>}
          {w.status === "uzavreno" && <span className="chip chip-info">Uzavřeno</span>}
          {w.daysLeft !== null && (
            <span className={`chip ${w.daysLeft === 0 ? "chip-late" : w.daysLeft <= 2 ? "chip-wait" : "chip-info"}`}>
              {w.daysLeft === 0 ? "Poslední den" : `Ještě ${w.daysLeft} ${plural(w.daysLeft, "den", "dny", "dní")}`}
            </span>
          )}
        </div>
        <h3 className={styles.title}>{w.title}</h3>
        {w.body && <p className={`${styles.desc} ${styles.clamp}`}>{w.body}</p>}
        {w.status === "vypsano" && w.activity && (
          <p className={styles.desc}>
            <strong>Připraveno jako: </strong>
            <Link href={w.activity.href}>{w.activity.title}</Link>
          </p>
        )}
        {w.status === "uzavreno" && w.note && (
          <p className={styles.desc}>
            <strong>Zdůvodnění: </strong>
            {w.note}
          </p>
        )}
        <div className={styles.meta}>
          <span>
            Přidal(a) {w.authorName} · {w.when}
          </span>
        </div>
        {((staff && w.status !== "vypsano") || (w.mine && open && w.voteCount <= 1)) && <WishActions w={w} staff={staff} />}
      </div>
    </article>
  );
}

function WishActions({ w, staff }: { w: WishView; staff: boolean }) {
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState("");
  const [res, setRes] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setRes(r);
      if (r.ok) setClosing(false);
    });
  const open = w.status === "open";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
      {!closing && (
        <div className={styles.inline}>
          {staff && open && (
            <>
              <Link href={`/ucitel/nova?typ=${w.kind}&prani=${w.id}`} className="btn btn-soft" style={{ minHeight: 36 }}>
                Vypsat
              </Link>
              <button type="button" className="btn btn-outline" style={{ minHeight: 36 }} onClick={() => setClosing(true)}>
                Uzavřít
              </button>
            </>
          )}
          {staff && w.status === "uzavreno" && (
            <button type="button" className="btn btn-outline" style={{ minHeight: 36 }} disabled={pending} onClick={() => act(() => reopenWish(w.id))}>
              Vrátit do hlasování
            </button>
          )}
          {w.mine && open && w.voteCount <= 1 && (
            <button type="button" className={styles.linkBtn} disabled={pending} onClick={() => act(() => deleteWish(w.id))}>
              Smazat moje přání
            </button>
          )}
        </div>
      )}
      {closing && (
        <>
          <textarea
            className={f.textarea}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Proč přání uzavíráš? (např. už existuje, nejde zařídit)"
            aria-label="Zdůvodnění"
          />
          <div className={styles.inline}>
            <button type="button" className="btn btn-primary" disabled={pending || !reason.trim()} onClick={() => act(() => closeWish(w.id, reason))}>
              Uzavřít a oznámit
            </button>
            <button type="button" className="btn btn-soft" onClick={() => setClosing(false)}>
              Zpět
            </button>
          </div>
        </>
      )}
      {(res.error || res.info) && (
        <p role="status" className={res.error ? f.formError : f.formInfo}>
          {res.error ?? res.info}
        </p>
      )}
    </div>
  );
}
