import type { Metadata } from "next";
import Link from "next/link";
import { ClassCard } from "@/components/ClassCard";
import { EmptyNote, PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { getUsersByIds, isTeacherOf, listActivities } from "@/lib/data";
import { activityHref } from "@/lib/links";
import { activityRange, formatDateRange, hasEnded } from "@/lib/periods";
import { canTeach, initials } from "@/lib/roles";
import { isLiveNow } from "@/lib/schedule";
import { pragueNow, toIso } from "@/lib/time";
import type { Activity } from "@/lib/types";
import styles from "../classes.module.css";

export const metadata: Metadata = { title: "Expedice" };

export default async function ExpeditionsPage() {
  const user = await requireUser();
  const now = pragueNow();
  const today = toIso(now);
  const expeditions = (await listActivities())
    .filter((a) => a.kind === "expedice")
    .sort((a, b) => (a.startsOn ?? "").localeCompare(b.startsOn ?? "") || a.title.localeCompare(b.title, "cs"));
  const upcoming = expeditions.filter((e) => !hasEnded(e, today));
  const ended = expeditions.filter((e) => hasEnded(e, today)).reverse();
  const mineFilter = (e: Activity) => e.studentIds.includes(user.id) || isTeacherOf(e, user.id);
  const mine = upcoming.filter(mineFilter);
  const others = upcoming.filter((e) => !mineFilter(e));

  const people = await getUsersByIds([...new Set(expeditions.flatMap((e) => [e.teacherId, ...(e.coTeacherIds ?? [])]))]);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name;
  const teachersLabel = (e: Activity) => [e.teacherId, ...(e.coTeacherIds ?? [])].map(nameOf).filter(Boolean).join(", ");

  // Nejbližší týden expedic (pro podnadpis).
  const next = upcoming[0] ? activityRange(upcoming[0]) : null;
  const subtitle = next?.from
    ? `Nejbližší týden expedic: ${formatDateRange(next.from, next.to, now.y)} · kurzy, ateliéry ani události v něm neprobíhají`
    : "Vícedenní výjezdy. V týdnu expedic neprobíhá jiná výuka.";

  const card = (e: Activity) => (
    <ClassCard
      key={e.id}
      activity={e}
      teacher={null}
      teacherLabel={teachersLabel(e)}
      isTeacher={isTeacherOf(e, user.id)}
      live={isLiveNow(e, now)}
    />
  );

  return (
    <>
      <PageHeader title="Expedice" subtitle={subtitle} avatar={{ initials: initials(user.name), name: user.name }}>
        {canTeach(user.role) && (
          <Link href="/ucitel/nova?typ=expedice" className="btn btn-outline-primary">
            + Nová expedice
          </Link>
        )}
      </PageHeader>

      {mine.length > 0 && (
        <>
          <h2 className="section-title">{canTeach(user.role) ? "Expedice, které vedu" : "Moje expedice"}</h2>
          <div className={styles.grid}>{mine.map(card)}</div>
        </>
      )}

      {others.length > 0 && (
        <>
          <h2 className="section-title">{mine.length ? "Další expedice" : "Expedice"}</h2>
          <div className={styles.grid}>{others.map(card)}</div>
        </>
      )}

      {upcoming.length === 0 && <EmptyNote>Zatím nejsou naplánované žádné expedice.</EmptyNote>}

      {ended.length > 0 && (
        <details className={styles.past}>
          <summary>Proběhlé expedice ({ended.length})</summary>
          {ended.map((e) => {
            const r = activityRange(e);
            return (
              <Link key={e.id} href={activityHref(e)} className={styles.pastRow}>
                <span className={styles.rowTitle}>{e.title}</span>
                <span className={styles.rowMeta}>{[formatDateRange(r.from, r.to), e.location].filter(Boolean).join(" · ")}</span>
              </Link>
            );
          })}
        </details>
      )}
    </>
  );
}
