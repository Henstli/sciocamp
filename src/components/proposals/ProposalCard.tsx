import Link from "next/link";
import { plural } from "@/lib/format";
import { CATEGORY_LABEL, GOAL_LABEL, proposalChip, votingDaysLeft, votingOpen, type Proposal } from "@/lib/proposals";
import { DeleteProposal } from "./ProposalActions";
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
  admin = false,
}: {
  admin?: boolean;
  p: Proposal;
  authorName: string;
  meId: string;
  now: Date;
  members: number;
}) {
  const chip = proposalChip(p, members);
  const open = p.status === "open";
  const voting = votingOpen(p, now.getTime());
  return (
    <article className={`card ${styles.item}`} data-closed={!open}>
      <div className={styles.body}>
        <div className={styles.chips}>
          <span className={`chip ${chip.tone}`}>{chip.label}</span>
          <span className="chip chip-info">{GOAL_LABEL[p.goal]}</span>
          <span className="chip chip-info">{CATEGORY_LABEL[p.category]}</span>
          {voting && p.mandatoryAt && <span className="chip chip-primary">Povinné hlasování</span>}
          {voting && <DaysLeftChip days={votingDaysLeft(p.votingEndsAt, now.getTime())} />}
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
            open={voting}
            isAuthor={p.authorId === meId}
          />
        )}
        {admin && !open && <DeleteProposal id={p.id} closed />}
      </div>
    </article>
  );
}

/** „Ještě 3 dny“ hlasování; poslední den červeně. */
export function DaysLeftChip({ days }: { days: number }) {
  return (
    <span className={`chip ${days === 0 ? "chip-late" : days <= 3 ? "chip-wait" : "chip-info"}`}>
      {days === 0 ? "Poslední den hlasování" : `Hlasuje se ještě ${days} ${plural(days, "den", "dny", "dní")}`}
    </span>
  );
}
