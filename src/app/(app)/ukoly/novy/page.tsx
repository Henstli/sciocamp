import type { Metadata } from "next";
import Link from "next/link";
import { AssignmentForm } from "@/components/assignments/AssignmentForm";
import { Icon } from "@/components/Icon";
import { EmptyNote, PageHeader } from "@/components/PageHeader";
import { requireTeacher } from "@/lib/auth";
import { activitiesTaughtBy, listActivities } from "@/lib/data";
import { assignmentsForUser } from "@/lib/data-assignments";
import { topicsByClass } from "@/lib/assignments";
import { activityHref } from "@/lib/links";
import { isAdmin } from "@/lib/roles";
import styles from "../ukol.module.css";

export const metadata: Metadata = { title: "Zadat úkol" };

export default async function NewAssignmentPage({ searchParams }: PageProps<"/ukoly/novy">) {
  const user = await requireTeacher();
  const { trida } = await searchParams;
  const classes = isAdmin(user.role) ? await listActivities() : await activitiesTaughtBy(user);
  const preselected = classes.find((c) => c.id === trida);
  const topics = topicsByClass(await assignmentsForUser(user));

  return (
    <>
      {preselected && (
        <Link href={`${activityHref(preselected)}?tab=work`} className={styles.back}>
          <Icon name="chevronLeft" size={16} strokeWidth={2.2} />
          {preselected.title}
        </Link>
      )}
      <PageHeader title="Zadat úkol" subtitle="Úkol nebo materiál uvidí všichni studenti zapsaní ve třídě." />
      {classes.length === 0 ? (
        <EmptyNote>
          Zatím neučíš žádnou třídu. Nejdřív si založ kurz nebo ateliér v <Link href="/ucitel">Moje třídy</Link>.
        </EmptyNote>
      ) : (
        <AssignmentForm
          classes={classes.map((c) => ({ id: c.id, title: c.title }))}
          topics={topics}
          initial={{
            activity: preselected?.id ?? classes[0].id,
            kind: "ukol",
            title: "",
            instructions: "",
            topic: "",
            due: "",
            maxPoints: "",
            links: "",
          }}
        />
      )}
    </>
  );
}

