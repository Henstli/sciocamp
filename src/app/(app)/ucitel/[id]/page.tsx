import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ActivityForm } from "@/components/manage/ActivityForm";
import { DeleteActivity } from "@/components/manage/DeleteActivity";
import { EnrollmentManager } from "@/components/manage/EnrollmentManager";
import { PageHeader } from "@/components/PageHeader";
import { requireTeacher } from "@/lib/auth";
import { getActivity, getUserById, listStaff, listStudents, teachesActivity } from "@/lib/data";
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
  const staff = admin ? (await listStaff()).map((s) => ({ id: s.id, name: s.name })) : [];
  const teacher = await getUserById(activity.teacherId);
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
      />

      <h2 className="section-title">Údaje a rozvrh</h2>
      <ActivityForm
        canPickTeacher={admin}
        staff={staff}
        initial={{
          slug: activity.id,
          kind: activity.kind,
          title: activity.title,
          description: activity.description ?? "",
          room: activity.room,
          capacity: activity.capacity ? String(activity.capacity) : "",
          meetUrl: activity.meetUrl ?? "",
          teacherId: activity.teacherId,
          grades: activity.allowedGrades ?? [],
          projectName: activity.project?.name ?? "",
          milestonesDone: activity.project?.milestonesDone ?? 0,
          milestonesTotal: activity.project?.milestonesTotal ?? 5,
          slots: activity.slots.map((s) => ({ day: s.day, start: s.start, end: s.end })),
        }}
      />

      <DeleteActivity slug={activity.id} title={activity.title} />
    </>
  );
}
