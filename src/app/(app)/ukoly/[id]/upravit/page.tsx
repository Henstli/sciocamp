import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssignmentForm } from "@/components/assignments/AssignmentForm";
import { DeleteAssignment } from "@/components/assignments/DeleteAssignment";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { requireTeacher } from "@/lib/auth";
import { getActivity, teachesActivity } from "@/lib/data";
import { assignmentFiles, assignmentsForActivity, getAssignment } from "@/lib/data-assignments";
import { isSupabase } from "@/lib/config";
import { isoToPragueLocal } from "@/lib/time";
import styles from "../../ukol.module.css";

export const metadata: Metadata = { title: "Upravit úkol" };

export default async function EditAssignmentPage({ params }: PageProps<"/ukoly/[id]/upravit">) {
  const user = await requireTeacher();
  const { id } = await params;
  const a = await getAssignment(id);
  const activity = a ? await getActivity(a.activityId) : null;
  if (!a || !activity || !teachesActivity(user, activity)) notFound();
  const topics = [...new Set((await assignmentsForActivity(activity)).map((x) => x.topic).filter((t): t is string => !!t))];

  return (
    <>
      <Link href={`/ukoly/${a.id}`} className={styles.back}>
        <Icon name="chevronLeft" size={16} strokeWidth={2.2} />
        {a.title}
      </Link>
      <PageHeader title={a.kind === "ukol" ? "Upravit úkol" : "Upravit materiál"} subtitle={activity.title} />
      <AssignmentForm
        live={isSupabase}
        files={await assignmentFiles(a.id)}
        classes={[{ id: activity.id, title: activity.title }]}
        topics={{ [activity.id]: topics }}
        initial={{
          id: a.id,
          activity: activity.id,
          kind: a.kind,
          title: a.title,
          instructions: a.instructions,
          topic: a.topic ?? "",
          due: a.dueAt ? isoToPragueLocal(a.dueAt) : "",
          maxPoints: a.maxPoints ? String(a.maxPoints) : "",
          links: a.links.map((l) => `${l.title} | ${l.url}`).join("\n"),
        }}
      />
      <DeleteAssignment id={a.id} title={a.title} />
    </>
  );
}
