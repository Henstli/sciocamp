import Link from "next/link";
import { ClassCard } from "./ClassCard";
import { EmptyNote, PageHeader } from "./PageHeader";
import { activitiesForUser, getUsersByIds, isTeacherOf, listActivities } from "@/lib/data";
import { activityHref } from "@/lib/links";
import { describeWhen, hasEnded } from "@/lib/periods";
import { initials } from "@/lib/roles";
import { expeditionBlocker, isLiveNow } from "@/lib/schedule";
import { pragueNow, toIso } from "@/lib/time";
import type { Activity, ActivityKind, User } from "@/lib/types";
import styles from "@/app/(app)/classes.module.css";

/**
 * Stránky Kurzy, Ateliéry, Události a Expedice: každý (i admin) tu vidí jen to,
 * kde je zapsaný nebo co vede. Celý přehled má admin ve Správě.
 */
export async function MyActivities({
  user,
  kind,
  title,
  subtitle,
  action,
  emptyText,
  pastLabel,
}: {
  user: User;
  kind: ActivityKind;
  title: string;
  subtitle: (current: number) => string;
  action?: React.ReactNode;
  emptyText: string;
  pastLabel: string;
}) {
  const now = pragueNow();
  const today = toIso(now);
  const blocked = expeditionBlocker(await listActivities());
  const byStart = (a: Activity, b: Activity) =>
    (a.startsOn ?? a.period?.startsOn ?? "").localeCompare(b.startsOn ?? b.period?.startsOn ?? "") || a.title.localeCompare(b.title, "cs");
  const all = (await activitiesForUser(user, kind)).sort(byStart);
  const current = all.filter((a) => !hasEnded(a, today));
  const ended = all.filter((a) => hasEnded(a, today)).reverse();

  const people = await getUsersByIds([...new Set(all.map((a) => a.teacherId))]);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "";
  // Hlavní vyučující a kolik dalších (u událostí pro všechny jich je hodně).
  const teachersLabel = (a: Activity) => {
    const more = (a.coTeacherIds ?? []).length;
    return [nameOf(a.teacherId), more > 0 ? `+ ${more} ${more < 5 ? "další" : "dalších"}` : null].filter(Boolean).join(" ");
  };

  return (
    <>
      <PageHeader title={title} subtitle={subtitle(current.length)} avatar={{ initials: initials(user.name), name: user.name }}>
        {action}
      </PageHeader>

      {current.length === 0 ? (
        <EmptyNote>{emptyText}</EmptyNote>
      ) : (
        <div className={styles.grid}>
          {current.map((a) => (
            <ClassCard
              key={a.id}
              activity={a}
              teacher={null}
              teacherLabel={teachersLabel(a)}
              isTeacher={isTeacherOf(a, user.id)}
              live={isLiveNow(a, now, blocked)}
            />
          ))}
        </div>
      )}

      {ended.length > 0 && (
        <details className={styles.past}>
          <summary>
            {pastLabel} ({ended.length})
          </summary>
          {ended.map((a) => (
            <Link key={a.id} href={activityHref(a)} className={styles.pastRow}>
              <span className={styles.rowTitle}>{a.title}</span>
              <span className={styles.rowMeta}>{[describeWhen(a), nameOf(a.teacherId)].filter(Boolean).join(" · ")}</span>
            </Link>
          ))}
        </details>
      )}
    </>
  );
}
