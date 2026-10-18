import type { Metadata } from "next";
import Link from "next/link";
import { ClassCard, Milestones } from "@/components/ClassCard";
import { Icon } from "@/components/Icon";
import { EmptyNote, PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { activitiesForUser, getClassroom, getUsersByIds, listActivities } from "@/lib/data";
import { plural } from "@/lib/format";
import { activityHref } from "@/lib/links";
import { initials } from "@/lib/roles";
import { isLiveNow } from "@/lib/schedule";
import { formatSlots, pragueNow } from "@/lib/time";
import styles from "../classes.module.css";

export const metadata: Metadata = { title: "Ateliéry" };

export default async function AteliersPage() {
  const user = await requireUser();
  const now = pragueNow();
  const mine = await activitiesForUser(user, "atelier");
  const others = (await listActivities()).filter((a) => a.kind === "atelier" && !mine.some((m) => m.id === a.id));
  const teachers = await getUsersByIds([...new Set([...mine, ...others].map((c) => c.teacherId))]);
  const teacherName = (id: string) => teachers.find((t) => t.id === id)?.name ?? "";

  const cards = await Promise.all(
    mine.map(async (a) => ({ activity: a, next: (await getClassroom(a)).upcoming[0] })),
  );

  return (
    <>
      <PageHeader
        title="Ateliéry"
        subtitle="Dlouhodobé projekty v týmech · blok 1"
        avatar={{ initials: initials(user.name), name: user.name }}
      >
        <Link href="/zapisy" className="btn btn-outline-primary">
          Zápis na další blok
        </Link>
      </PageHeader>

      <h2 className="section-title">{user.role === "student" ? "Moje ateliéry" : "Ateliéry, které vedu"}</h2>
      {cards.length === 0 ? (
        <EmptyNote>V tomhle bloku nemáš žádný ateliér.</EmptyNote>
      ) : (
        <div className={styles.gridWide}>
          {cards.map(({ activity, next }) => (
            <ClassCard
              key={activity.id}
              activity={activity}
              teacher={teachers.find((t) => t.id === activity.teacherId) ?? null}
              isTeacher={activity.teacherId === user.id}
              live={isLiveNow(activity, now)}
              extra={
                <>
                  {activity.project && (
                    <Milestones
                      label={`Projekt: ${activity.project.name}`}
                      done={activity.project.milestonesDone}
                      total={activity.project.milestonesTotal}
                      tone={activity.tone}
                    />
                  )}
                  {next && (
                    <Link href={activityHref(activity)} className={styles.nextTask}>
                      <span className={`chip ${next.urgent ? "chip-wait" : "chip-info"}`}>{next.when}</span>
                      <span>{next.title}</span>
                      <Icon name="chevronRight" size={16} style={{ color: "var(--text-muted)" }} />
                    </Link>
                  )}
                </>
              }
            />
          ))}
        </div>
      )}

      {others.length > 0 && (
        <>
          <h2 className="section-title" style={{ marginTop: 8 }}>
            Další ateliéry tento blok
          </h2>
          <section className={`card ${styles.list}`}>
            {others.map((o) => (
              <div key={o.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>{o.title}</div>
                  <div className={styles.rowMeta}>
                    {teacherName(o.teacherId)} · {formatSlots(o.slots)}
                  </div>
                </div>
                <div className={styles.rowSide}>
                  {o.studentIds.length} {plural(o.studentIds.length, "student", "studenti", "studentů")}
                </div>
                {user.role === "admin" && (
                  <Link href={activityHref(o)} className="btn btn-outline" style={{ minHeight: 40 }}>
                    Otevřít
                  </Link>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
