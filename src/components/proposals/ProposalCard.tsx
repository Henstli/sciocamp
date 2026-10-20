import Link from "next/link";
import { CATEGORY_LABEL, GOAL_LABEL, proposalChip, proposalTarget, type Proposal } from "@/lib/proposals";
import { plural } from "@/lib/format";
import { formatStamp } from "@/lib/time";
import { VoteButton } from "./VoteButton";
import styles from "@/app/(app)/navrhy/navrhy.module.css";

/** Karta návrhu v seznamu: podpora, štítky, text, autor a ukazatel podpory. */
export function ProposalCard({ p, authorName, meId, now }: { p: Proposal; authorName: string; meId: string; now: Date }) {
  const chip = proposalChip(p);
  const target = proposalTarget(p);
  const open = p.status === "open";
  const done = p.supportCount >= target;
  return (
    <article className={`card ${styles.item}`} data-closed={!open}>
      <VoteButton
        id={p.id}
        kind="proposal"
        count={p.supportCount}
        on={p.supported}
        disabled={!open}
        locked={p.authorId === meId}
        label="podpora"
      />
      <div className={styles.body}>
        <div className={styles.chips}>
          <span className={`chip ${chip.tone}`}>{chip.label}</span>
          <span className="chip chip-info">{GOAL_LABEL[p.goal]}</span>
          <span className="chip chip-info">{CATEGORY_LABEL[p.category]}</span>
        </div>
        <Link href={`/navrhy/${p.id}`} className={styles.title}>
          {p.title}
        </Link>
        {p.body && <p className={`${styles.desc} ${styles.clamp}`}>{p.body}</p>}
        {!open && p.resolution && (
          <p className={`${styles.desc} ${styles.clamp}`}>
            <strong>{p.status === "projednano" ? "Závěr: " : "Zdůvodnění: "}</strong>
            {p.resolution}
          </p>
        )}
        <div className={styles.meta}>
          <span>
            {authorName} · {formatStamp(p.createdAt, now)}
          </span>
          <Link href={`/navrhy/${p.id}#komentare`}>
            {p.commentCount} {plural(p.commentCount, "komentář", "komentáře", "komentářů")}
          </Link>
        </div>
        {open && (
          <div className={styles.progress}>
            <span className={styles.track}>
              <span className={styles.fill} data-done={done} style={{ width: `${Math.min(100, Math.round((p.supportCount / target) * 100))}%` }} />
            </span>
            <span className={styles.count}>
              {p.supportCount} / {target}
              {p.need === null && " (navrženo)"}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
