import type { Metadata } from "next";
import Link from "next/link";
import { ClassCard } from "@/components/ClassCard";
import { EmptyNote, PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { activitiesForUser, getUsersByIds, listActivities, listPeriods } from "@/lib/data";
import { activityHref } from "@/lib/links";
import { currentPeriod, formatDateRange, hasEnded } from "@/lib/periods";
import { plural } from "@/lib/format";
import { initials, isAdmin } from "@/lib/roles";
import { expeditionBlocker, isLiveNow } from "@/lib/schedule";
import { pragueNow, toIso } from "@/lib/time";
import styles from "../classes.module.css";

export const metadata: Metadata = { title: "Kurzy" };

export default async function CoursesPage() {
  const user = await requireUser();
  const now = pragueNow();
  const blocked = expeditionBlocker(await listActivities());

  // Admin vidí celou nabídku, ostatní kurzy, které navštěvují nebo učí.
  const allCourses = isAdmin(user.role)
    ? (await listActivities()).filter((a) => a.kind === "kurz")
    : await activitiesForUser(user, "kurz");
  const today = toIso(now);
  const period = currentPeriod(await listPeriods(), today);
  // Kurzy končí s kurzovým obdobím; proběhlé jen ve skrytém seznamu.
  const courses = allCourses.filter((c) => !hasEnded(c, today));
  const ended = allCourses.filter((c) => hasEnded(c, today));
  const teachers = await getUsersByIds([...new Set(allCourses.map((c) => c.teacherId))]);
  const teacherOf = (id: string) => teachers.find((t) => t.id === id) ?? null;

  const prefix = period ? `${period.name} (${formatDateRange(period.startsOn, period.endsOn)}) · ` : "";
  const subtitle =
    user.role === "student"
      ? `${prefix}${courses.length} ${plural(courses.length, "kurz", "kurzy", "kurzů")}, do kterých chodíš`
      : user.role === "admin"
        ? `${prefix}všech ${courses.length} ${plural(courses.length, "kurz", "kurzy", "kurzů")} v nabídce`
        : `${prefix}${courses.length} ${plural(courses.length, "kurz", "kurzy", "kurzů")}, které učíš`;

  return (
    <>
      <PageHeader title="Kurzy" subtitle={subtitle} avatar={{ initials: initials(user.name), name: user.name }}>
        <Link href="/zapisy" className="btn btn-outline-primary">
          Celá nabídka a zápis
        </Link>
      </PageHeader>

      {courses.length === 0 ? (
        <EmptyNote>Zatím nemáš žádné kurzy. Zapsat se můžeš v sekci Zápisy.</EmptyNote>
      ) : (
        <div className={styles.grid}>
          {courses.map((c) => (
            <ClassCard
              key={c.id}
              activity={c}
              teacher={teacherOf(c.teacherId)}
              isTeacher={c.teacherId === user.id}
              live={isLiveNow(c, now, blocked)}
            />
          ))}
        </div>
      )}

      {ended.length > 0 && (
        <details className={styles.past}>
          <summary>Proběhlé kurzy ({ended.length})</summary>
          {ended.map((c) => (
            <Link key={c.id} href={activityHref(c)} className={styles.pastRow}>
              <span className={styles.rowTitle}>{c.title}</span>
              <span className={styles.rowMeta}>
                {[c.period?.name, teacherOf(c.teacherId)?.name].filter(Boolean).join(" · ")}
              </span>
            </Link>
          ))}
        </details>
      )}
    </>
  );
}
