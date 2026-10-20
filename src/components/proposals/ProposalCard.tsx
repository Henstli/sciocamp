import Link from "next/link";
import { plural } from "@/lib/format";
import { CATEGORY_LABEL, GOAL_LABEL, proposalChip, type Proposal } from "@/lib/proposals";
import { formatStamp } from "@/lib/time";
import { ProposalVote } from "./ProposalVote";
import styles from "@/app/(app)/navrhy/navrhy.module.css";

/** Karta návrhu v seznamu: štítky, text, autor, hlasování a průběžný výsledek. */
export function ProposalCard({
  p,
  authorName,
  meId,
  now,
  members,
}: {
  p: Proposal;
  authorName: string;
  meId: string;
  now: Date;
  members: number;
}) {
  const chip = proposalChip(p, members);
  const open = p.status === "open";
  return (
    <article className={`card ${styles.item}`} data-closed={!open}>
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
        {p.status !== "stazeno" && (
          <ProposalVote
            id={p.id}
            counts={{ pro: p.proCount, jedno: p.neutralCount, proti: p.againstCount }}
            myChoice={p.myChoice}
            members={members}
            needPercent={p.needPercent ?? p.needPercentProposed}
            needConfirmed={p.needPercent !== null}
            open={open}
            isAuthor={p.authorId === meId}
          />
        )}
      </div>
    </article>
  );
}
