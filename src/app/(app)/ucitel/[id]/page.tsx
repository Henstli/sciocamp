import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ActivityForm } from "@/components/manage/ActivityForm";
import { DeleteActivity } from "@/components/manage/DeleteActivity";
import { EnrollmentManager } from "@/components/manage/EnrollmentManager";
import { PageHeader } from "@/components/PageHeader";
import { requireTeacher } from "@/lib/auth";
import { getActivity, getUserById, listActivities, listPeriods, listStaff, listStudents, listTerms, teachesActivity } from "@/lib/data";
import { atelierConflicts } from "@/lib/periods";
import { KIND_LABEL, activityHref } from "@/lib/links";
import { initials, isAdmin } from "@/lib/roles";
import { nowMs, todayIso } from "@/lib/time";
import { waitlistFor } from "@/lib/data-enroll";
import styles from "../ucitel.module.css";

export async function generateMetadata({ params }: PageProps<"/ucitel/[id]">): Promise<Metadata> {
  const activity = await getActivity((await params).id);
  return { title: activity ? `Správa: ${activity.title}` : "Správa aktivity" };
}

export default async function ManageActivityPage({ params, searchParams }: PageProps<"/ucitel/[id]">) {
  const user = await requireTeacher();
  const { id } = await params;
  const { nova } = await searchParams;
  const activity = await getActivity(id);
  if (!activity || !teachesActivity(user, activity)) notFound();

  const admin = isAdmin(user.role);
  const staff = (await listStaff()).map((s) => ({ id: s.id, name: s.name }));
  const teacher = await getUserById(activity.teacherId);
  const periods = await listPeriods();
  const conflicts = atelierConflicts(activity, await listActivities());
  const waitlist = await waitlistFor(activity.id, activity.dbId);
  const students = (await listStudents()).map((s) => ({
    id: s.id,
    name: s.name,
    initials: initials(s.name),
    grade: s.grade,
    email: s.email,
  }));

  return (
    <>
      <Link href="/ucitel" className={styles.back}>
        <Icon name="chevronLeft" size={16} strokeWidth={2.2} />
        Moje třídy
      </Link>
      <PageHeader
        eyebrow={`${KIND_LABEL[activity.kind]} · vede ${teacher?.name ?? "—"}`}
        title={activity.title}
        subtitle="Nastavení, rozvrh a zapsaní studenti"
      >
        <Link href={activityHref(activity)} className="btn btn-outline-primary">
          Otevřít třídu
        </Link>
      </PageHeader>

      {nova && (
        <p role="status" className={styles.success}>
          Hotovo, aktivita je založená. Teď do ní zapiš studenty.
        </p>
      )}

      <h2 className="section-title">Studenti</h2>
      <EnrollmentManager
        slug={activity.id}
        students={students}
        enrolledIds={activity.studentIds}
        allowedGrades={activity.allowedGrades}
        capacity={activity.capacity ?? null}
        conflicts={conflicts}
      />
      {waitlist.length > 0 && (
        <section aria-label="Čekací řada" className={`card ${styles.waitlist}`}>
          <h3 className={styles.waitTitle}>Čekací řada · {waitlist.length}</h3>
          <ol className={styles.waitList}>
            {waitlist.map((sid) => {
              const s = students.find((x) => x.id === sid);
              return (
                <li key={sid}>
                  {s?.name ?? "Student"}
                  {s?.grade ? <span className={styles.waitMeta}> · {s.grade}. ročník</span> : null}
                </li>
              );
            })}
          </ol>
          <p className={styles.waitMeta}>
            Když se uvolní místo, první z řady se zapíše sám (pokud se mu nic nekříží) a přijde mu oznámení. Zapsáním výše ho
            z řady vezmeš hned.
          </p>
        </section>
      )}

      <h2 className="section-title">Údaje a rozvrh</h2>
      <ActivityForm
        periods={periods}
        terms={(await listTerms()).filter((t) => t.endsOn >= todayIso() || t.id === activity.termId)}
        canPickTeacher={admin}
        staff={staff}
        initial={{
          slug: activity.id,
          kind: activity.kind,
          title: activity.title,
          description: activity.description ?? "",
          location: activity.location ?? "",
          periodId: activity.period?.id ?? "",
          startsOn: activity.startsOn ?? "",
          endsOn: activity.endsOn ?? "",
          capacity: activity.capacity ? String(activity.capacity) : "",
          meetUrl: activity.meetUrl ?? "",
          teacherId: activity.teacherId,
          grades: activity.allowedGrades ?? [],
          projectName: activity.project?.name ?? "",
          milestonesDone: activity.project?.milestonesDone ?? 0,
          milestonesTotal: activity.project?.milestonesTotal ?? 5,
          slots: activity.slots.map((s) => ({ day: s.day, start: s.start, end: s.end })),
          coTeacherIds: activity.coTeacherIds ?? [],
          announceReady: activity.announceReady ?? false,
          termId: activity.termId ?? "",
          forAllStudents: activity.forAllStudents ?? false,
          forAllStaff: activity.forAllStaff ?? false,
          round:
            activity.round && Date.parse(activity.round.closesAt) > nowMs()
              ? { opensAt: activity.round.opensAt, closesAt: activity.round.closesAt, started: Date.parse(activity.round.opensAt) <= nowMs() }
              : null,
        }}
      />

      <DeleteActivity slug={activity.id} title={activity.title} />
    </>
  );
}
