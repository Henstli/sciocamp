import type { Metadata } from "next";
import Link from "next/link";
import { ClassCard } from "@/components/ClassCard";
import { EmptyNote, PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { activitiesForUser, getUsersByIds, isTeacherOf, listActivities } from "@/lib/data";
import { plural } from "@/lib/format";
import { activityHref } from "@/lib/links";
import { describeWhen, hasEnded } from "@/lib/periods";
import { canTeach, initials, isAdmin } from "@/lib/roles";
import { expeditionBlocker, isLiveNow } from "@/lib/schedule";
import { pragueNow, toIso } from "@/lib/time";
import styles from "../classes.module.css";

export const metadata: Metadata = { title: "Události" };

export default async function EventsPage() {
  const user = await requireUser();
  const now = pragueNow();
  const today = toIso(now);
  const all = await listActivities();
  const blocked = expeditionBlocker(all);

  // Admin vidí všechny události, ostatní ty, kterých se účastní nebo je vedou.
  const events = (isAdmin(user.role) ? all.filter((a) => a.kind === "ostatni") : await activitiesForUser(user, "ostatni")).sort(
    (a, b) => (a.startsOn ?? "").localeCompare(b.startsOn ?? "") || a.title.localeCompare(b.title, "cs"),
  );
  const current = events.filter((e) => !hasEnded(e, today));
  const ended = events.filter((e) => hasEnded(e, today));
  const teachers = await getUsersByIds([...new Set(events.map((e) => e.teacherId))]);
  const teacherOf = (id: string) => teachers.find((t) => t.id === id) ?? null;

  return (
    <>
      <PageHeader
        title="Události"
        subtitle={`Třídnické konzultace, semináře a další akce · ${current.length} ${plural(current.length, "událost", "události", "událostí")}`}
        avatar={{ initials: initials(user.name), name: user.name }}
      >
        {canTeach(user.role) && (
          <Link href="/ucitel/nova?typ=ostatni" className="btn btn-outline-primary">
            + Nová událost
          </Link>
        )}
      </PageHeader>

      {current.length === 0 ? (
        <EmptyNote>Teď tu nejsou žádné události.</EmptyNote>
      ) : (
        <div className={styles.grid}>
          {current.map((e) => (
            <ClassCard
              key={e.id}
              activity={e}
              teacher={teacherOf(e.teacherId)}
              isTeacher={isTeacherOf(e, user.id)}
              live={isLiveNow(e, now, blocked)}
            />
          ))}
        </div>
      )}

      {ended.length > 0 && (
        <details className={styles.past}>
          <summary>Proběhlé události ({ended.length})</summary>
          {ended.map((e) => (
            <Link key={e.id} href={activityHref(e)} className={styles.pastRow}>
              <span className={styles.rowTitle}>{e.title}</span>
              <span className={styles.rowMeta}>{[describeWhen(e), teacherOf(e.teacherId)?.name].filter(Boolean).join(" · ")}</span>
            </Link>
          ))}
        </details>
      )}
    </>
  );
}
