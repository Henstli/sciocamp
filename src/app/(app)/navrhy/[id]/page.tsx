import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { StaffPanel, WithdrawButton } from "@/components/proposals/ProposalActions";
import { ProposalComments } from "@/components/proposals/ProposalComments";
import { ProposalVote } from "@/components/proposals/ProposalVote";
import { requireUser } from "@/lib/auth";
import { getUsersByIds } from "@/lib/data";
import { getProposal, memberCount } from "@/lib/data-proposals";
import { CATEGORY_LABEL, GOAL_LABEL, proposalChip } from "@/lib/proposals";
import { canTeach, initials, isAdmin } from "@/lib/roles";
import { formatStamp, nowMs } from "@/lib/time";
import styles from "../navrhy.module.css";

export const metadata: Metadata = { title: "Návrh" };

const OUTCOME = {
  projednano: { title: "Závěr ze shromáždění", tone: "info" },
  schvaleno: { title: "Schváleno", tone: "ok" },
  zamitnuto: { title: "Zamítnuto", tone: "late" },
  stazeno: { title: "Autor návrh stáhl", tone: "info" },
} as const;

export default async function ProposalPage({ params }: PageProps<"/navrhy/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const [data, members] = await Promise.all([getProposal(user, id), memberCount()]);
  if (!data) notFound();
  const { proposal: p, comments } = data;
  const people = await getUsersByIds([...new Set([p.authorId, ...comments.map((c) => c.authorId), ...(p.resolvedBy ? [p.resolvedBy] : [])])]);
  const nameOf = (pid: string) => people.find((u) => u.id === pid)?.name ?? "Bývalý člen školy";
  const now = new Date(nowMs());
  const chip = proposalChip(p, members);
  const open = p.status === "open";
  const admin = isAdmin(user.role);
  const outcome = p.status === "open" ? null : OUTCOME[p.status];

  return (
    <>
      <PageHeader title="Návrhy" avatar={{ initials: initials(user.name), name: user.name }} />
      <div className={styles.detail}>
        <Link href="/navrhy" className={styles.back}>
          <span aria-hidden="true">←</span>
          Všechny návrhy
        </Link>

        <article className={`card ${styles.item}`} style={{ padding: "22px 24px" }}>

          <div className={styles.body} style={{ gap: 10 }}>
            <div className={styles.chips}>
              <span className={`chip ${chip.tone}`}>{chip.label}</span>
              <span className="chip chip-info">{GOAL_LABEL[p.goal]}</span>
              <span className="chip chip-info">{CATEGORY_LABEL[p.category]}</span>
            </div>
            <h1 className={styles.title} style={{ fontSize: 22 }}>
              {p.title}
            </h1>
            <div className={styles.meta}>
              <span>
                <Link href={`/lide/${p.authorId}`}>{nameOf(p.authorId)}</Link> · {formatStamp(p.createdAt, now)}
              </span>
            </div>
            {p.body ? <p className={styles.desc}>{p.body}</p> : <p className={styles.empty}>Bez popisu.</p>}
            {p.status !== "stazeno" && (
              <ProposalVote
                id={p.id}
                counts={{ pro: p.proCount, jedno: p.neutralCount, proti: p.againstCount }}
                myChoice={p.myChoice}
                members={members}
                needPercent={p.needPercent ?? p.needPercentProposed}
                needConfirmed={p.needPercent !== null}
                open={open}
                isAuthor={p.authorId === user.id}
              />
            )}
            {outcome && (
              <div className={styles.outcome} data-tone={outcome.tone}>
                <strong>{outcome.title}</strong>
                {p.resolution ?? (p.status === "stazeno" ? "Návrh už nejde podpořit." : "")}
                {p.resolvedBy && p.status !== "stazeno" && p.resolvedAt && (
                  <div className={styles.meta} style={{ marginTop: 6 }}>
                    {nameOf(p.resolvedBy)} · {formatStamp(p.resolvedAt, now)}
                  </div>
                )}
              </div>
            )}
            {open && p.authorId === user.id && (
              <div>
                <WithdrawButton id={p.id} />
              </div>
            )}
          </div>
        </article>

        {canTeach(user.role) && (
          <StaffPanel
            id={p.id}
            goal={p.goal}
            status={p.status}
            needPercent={p.needPercent}
            needPercentProposed={p.needPercentProposed}
            members={members}
            admin={admin}
          />
        )}


        <ProposalComments
          id={p.id}
          me={{ initials: initials(user.name) }}
          comments={comments.map((c) => ({
            id: c.id,
            authorId: c.authorId,
            name: nameOf(c.authorId),
            initials: initials(nameOf(c.authorId)),
            when: formatStamp(c.createdAt, now),
            body: c.body,
            canDelete: c.authorId === user.id || admin,
          }))}
        />
      </div>
    </>
  );
}
