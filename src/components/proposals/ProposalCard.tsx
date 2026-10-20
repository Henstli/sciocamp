import Link from "next/link";
import { plural } from "@/lib/format";
import { CATEGORY_LABEL, GOAL_LABEL, proposalChip, votingDaysLeft, votingOpen, type Proposal } from "@/lib/proposals";
import { DeleteProposal } from "./ProposalActions";
import { formatStamp } from "@/lib/time";
import { Icon } from "@/components/Icon";
import { ProposalVote } from "./ProposalVote";
import styles from "@/app/(app)/navrhy/navrhy.module.css";

/** Karta návrhu v seznamu: název, autor, zbývající dny, text, hlasování, výsledek a stav. */
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
      <div className={styles.body} style={{ gap: 10 }}>
        <div className={styles.cardHead}>
          <div className={styles.cardTitle}>
            <Link href={`/navrhy/${p.id}`} className={styles.title}>
              {p.title}
            </Link>
            <div className={styles.meta}>
              {authorName} · {formatStamp(p.createdAt, now)} · {CATEGORY_LABEL[p.category]}
            </div>
          </div>
          <ProposalHeadChips p={p} chip={chip} voting={voting} now={now} />
        </div>
        {p.body && <p className={`${styles.desc} ${styles.clamp}`}>{p.body}</p>}
        {!open && p.resolution && (
          <p className={`${styles.desc} ${styles.clamp}`}>
            <strong>{p.status === "projednano" ? "Závěr: " : "Zdůvodnění: "}</strong>
            {p.resolution}
          </p>
        )}
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
        <div className={styles.cardFoot}>
          <ProposalStatusLine p={p} chip={chip} />
          <Link href={`/navrhy/${p.id}#komentare`} className={styles.comments} aria-label={`${p.commentCount} ${plural(p.commentCount, "komentář", "komentáře", "komentářů")}`}>
            <Icon name="comment" size={16} />
            {p.commentCount}
          </Link>
        </div>
        {admin && !open && <DeleteProposal id={p.id} closed />}
      </div>
    </article>
  );
}

type Chip = { label: string; tone: string };

/** Vpravo nahoře: dokud se hlasuje, kolik zbývá (a povinné hlasování); potom výsledek. */
export function ProposalHeadChips({ p, chip, voting, now }: { p: Proposal; chip: Chip; voting: boolean; now: Date }) {
  return (
    <div className={styles.headChips}>
      {voting && p.mandatoryAt && <span className="chip chip-primary">Povinné</span>}
      {voting ? <DaysLeftChip days={votingDaysLeft(p.votingEndsAt, now.getTime())} /> : p.status !== "open" && <span className={`chip ${chip.tone}`}>{chip.label}</span>}
    </div>
  );
}

/** Dole: cíl návrhu a stav prahu („Na shromáždění · práh čeká na potvrzení“). */
export function ProposalStatusLine({ p, chip }: { p: Proposal; chip: Chip }) {
  const tone = p.status !== "open" ? "info" : p.needPercent === null ? "wait" : chip.tone === "chip-ok" ? "ok" : "info";
  const state =
    p.status !== "open"
      ? null
      : p.needPercent === null
        ? "práh čeká na potvrzení"
        : chip.tone === "chip-ok"
          ? "práh splněn"
          : "sbírá hlasy";
  return (
    <span className={styles.statusLine} data-tone={tone}>
      <Icon name={tone === "ok" ? "check" : tone === "wait" ? "clock" : "vote"} size={16} />
      {GOAL_LABEL[p.goal]}
      {state && ` · ${state}`}
    </span>
  );
}

/** „Ještě 3 dny“ hlasování; poslední den červeně, poslední 3 dny oranžově. */
export function DaysLeftChip({ days }: { days: number }) {
  return (
    <span className={`chip ${days === 0 ? "chip-late" : days <= 3 ? "chip-wait" : "chip-info"}`} title="Do konce hlasování">
      <Icon name="clock" size={13} />
      {days === 0 ? "Poslední den" : `Ještě ${days} ${plural(days, "den", "dny", "dní")}`}
    </span>
  );
}
