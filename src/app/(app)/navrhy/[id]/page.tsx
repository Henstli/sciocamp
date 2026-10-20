import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { StaffPanel, WithdrawButton } from "@/components/proposals/ProposalActions";
import { ProposalComments } from "@/components/proposals/ProposalComments";
import { VoteButton } from "@/components/proposals/VoteButton";
import { requireUser } from "@/lib/auth";
import { getUsersByIds } from "@/lib/data";
import { getProposal } from "@/lib/data-proposals";
import { plural } from "@/lib/format";
import { CATEGORY_LABEL, GOAL_LABEL, proposalChip, proposalTarget } from "@/lib/proposals";
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
  const data = await getProposal(user, id);
  if (!data) notFound();
  const { proposal: p, comments, supporters } = data;
  const people = await getUsersByIds([...new Set([p.authorId, ...supporters, ...comments.map((c) => c.authorId), ...(p.resolvedBy ? [p.resolvedBy] : [])])]);
  const person = (pid: string) => people.find((u) => u.id === pid);
  const nameOf = (pid: string) => person(pid)?.name ?? "Bývalý člen školy";
  const now = new Date(nowMs());
  const chip = proposalChip(p);
  const target = proposalTarget(p);
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
          <VoteButton
            id={p.id}
            kind="proposal"
            count={p.supportCount}
            on={p.supported}
            disabled={!open}
            locked={p.authorId === user.id}
            label="podpora"
          />
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
            {open && (
              <div className={styles.progress}>
                <span className={styles.track}>
                  <span
                    className={styles.fill}
                    data-done={p.supportCount >= target}
                    style={{ width: `${Math.min(100, Math.round((p.supportCount / target) * 100))}%` }}
                  />
                </span>
                <span className={styles.count}>
                  {p.supportCount} / {target} {plural(target, "podporovatel", "podporovatelé", "podporovatelů")}
                  {p.need === null && " (navrženo autorem, čeká na potvrzení)"}
                </span>
              </div>
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
          <StaffPanel id={p.id} goal={p.goal} status={p.status} need={p.need} needProposed={p.needProposed} admin={admin} />
        )}

        <section className={`card ${styles.panel}`} aria-label="Podporovatelé">
          <h2>
            {supporters.length} {plural(supporters.length, "podporovatel", "podporovatelé", "podporovatelů")}
          </h2>
          <div className={styles.people}>
            {supporters.map((sid) => (
              <Avatar key={sid} initials={initials(nameOf(sid))} size={36} href={`/lide/${sid}`} title={nameOf(sid)} tone={sid === user.id ? "me" : person(sid)?.role === "student" ? "student" : "ucitel"} />
            ))}
          </div>
        </section>

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
