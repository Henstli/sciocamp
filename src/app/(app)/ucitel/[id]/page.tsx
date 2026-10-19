import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ActivityForm } from "@/components/manage/ActivityForm";
import { DeleteActivity } from "@/components/manage/DeleteActivity";
import { EnrollmentManager } from "@/components/manage/EnrollmentManager";
import { TeamEditor } from "@/components/manage/TeamEditor";
import { teamsFor } from "@/lib/data-teams";
import { isSupabase } from "@/lib/config";
import { PageHeader } from "@/components/PageHeader";
import { requireTeacher } from "@/lib/auth";
import { getActivity, getUserById, listActivities, listPeriods, listStaff, listStudents, teachesActivity } from "@/lib/data";
import { atelierConflicts } from "@/lib/periods";
import { KIND_LABEL, activityHref } from "@/lib/links";
import { initials, isAdmin } from "@/lib/roles";
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
  const teams = await teamsFor(activity);
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

      <TeamEditor
        key={teams.map((t) => `${t.id}:${t.memberIds.join(",")}`).join("|")}
        slug={activity.id}
        students={students.filter((s) => activity.studentIds.includes(s.id)).map((s) => ({ id: s.id, name: s.name }))}
        initial={teams.map((t) => ({ id: isSupabase ? t.id : undefined, name: t.name, memberIds: t.memberIds }))}
      />

      <h2 className="section-title">Údaje a rozvrh</h2>
      <ActivityForm
        periods={periods}
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
        }}
      />

      <DeleteActivity slug={activity.id} title={activity.title} />
    </>
  );
}
