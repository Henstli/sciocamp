"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { closeWish, deleteWish, fulfilWish, reopenWish, type ActionResult } from "@/lib/actions/proposals";
import { plural } from "@/lib/format";
import { WISH_KIND_LABEL, type Wish, type WishKind } from "@/lib/proposals";
import { VoteButton } from "./VoteButton";
import f from "@/components/manage/manage.module.css";
import styles from "@/app/(app)/navrhy/navrhy.module.css";

export type WishView = Wish & { authorName: string; when: string; activity: { href: string; title: string } | null; mine: boolean };
export type ActivityOption = { slug: string; title: string; kind: WishKind; detail: string };

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
export function WishBoard({ wishes, staff, activities }: { wishes: WishView[]; staff: boolean; activities: ActivityOption[] }) {
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
        open.map((w) => <WishCard key={w.id} w={w} staff={staff} activities={activities} />)
      )}
      {done.length > 0 && (
        <details className={styles.closed}>
          <summary>
            Vypsané a uzavřené <span>{done.length}</span>
          </summary>
          <div className={styles.closedList}>
            {done.map((w) => (
              <WishCard key={w.id} w={w} staff={staff} activities={activities} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function WishCard({ w, staff, activities }: { w: WishView; staff: boolean; activities: ActivityOption[] }) {
  const open = w.status === "open";
  return (
    <article className={`card ${styles.item}`} data-closed={!open} id={`prani-${w.id}`}>
      <VoteButton id={w.id} kind="wish" count={w.voteCount} on={w.voted} disabled={!open} label="chci to" />
      <div className={styles.body}>
        <div className={styles.chips}>
          <span className="chip" style={KIND_CHIP[w.kind]}>
            {WISH_KIND_LABEL[w.kind]}
          </span>
          {w.status === "vypsano" && <span className="chip chip-ok">Vypsáno</span>}
          {w.status === "uzavreno" && <span className="chip chip-info">Uzavřeno</span>}
        </div>
        <h3 className={styles.title}>{w.title}</h3>
        {w.body && <p className={`${styles.desc} ${styles.clamp}`}>{w.body}</p>}
        {w.status === "vypsano" && w.activity && (
          <p className={styles.desc}>
            <strong>Vypsáno jako: </strong>
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
            {w.voteCount} {plural(w.voteCount, "člověk to chce", "lidé to chtějí", "lidí to chce")}
          </span>
          <span>
            Přidal(a) {w.authorName} · {w.when}
          </span>
        </div>
        {(staff || (w.mine && open && w.voteCount <= 1)) && <WishActions w={w} staff={staff} activities={activities} />}
      </div>
    </article>
  );
}

function WishActions({ w, staff, activities }: { w: WishView; staff: boolean; activities: ActivityOption[] }) {
  const [mode, setMode] = useState<"idle" | "fulfil" | "close">("idle");
  const [slug, setSlug] = useState("");
  const [reason, setReason] = useState("");
  const [res, setRes] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setRes(r);
      if (r.ok) setMode("idle");
    });
  const matching = activities.filter((a) => a.kind === w.kind);
  const others = activities.filter((a) => a.kind !== w.kind);
  const open = w.status === "open";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
      {mode === "idle" && (
        <div className={styles.inline}>
          {staff && open && (
            <>
              <button type="button" className="btn btn-soft" style={{ minHeight: 36 }} onClick={() => setMode("fulfil")}>
                Vypsat
              </button>
              <button type="button" className="btn btn-outline" style={{ minHeight: 36 }} onClick={() => setMode("close")}>
                Uzavřít
              </button>
            </>
          )}
          {staff && !open && (
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
      {mode === "fulfil" && (
        <div className={styles.inline}>
          <select className={f.input} style={{ flex: "1 1 240px", width: "auto" }} value={slug} onChange={(e) => setSlug(e.target.value)} aria-label="Vypsaná aktivita">
            <option value="" disabled>
              Vyber vypsanou aktivitu…
            </option>
            {matching.length > 0 && (
              <optgroup label={WISH_KIND_LABEL[w.kind]}>
                {matching.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.title} · {a.detail}
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="Ostatní">
                {others.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.title} · {a.detail}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button type="button" className="btn btn-primary" disabled={pending || !slug} onClick={() => act(() => fulfilWish(w.id, slug))}>
            Vypsat a oznámit
          </button>
          <button type="button" className="btn btn-soft" onClick={() => setMode("idle")}>
            Zpět
          </button>
        </div>
      )}
      {mode === "fulfil" && <span className={f.hint}>Nejdřív aktivitu založ v Moje třídy. Oznámení dostanou všichni, kdo ji chtěli.</span>}
      {mode === "close" && (
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
            <button type="button" className="btn btn-soft" onClick={() => setMode("idle")}>
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
