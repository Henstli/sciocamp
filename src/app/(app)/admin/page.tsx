import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { listActivities, listUsers } from "@/lib/data";
import { KIND_LABEL } from "@/lib/links";
import { initials } from "@/lib/roles";
import { formatSlots } from "@/lib/time";
import { AdminTabs } from "./AdminTabs";
import styles from "./admin.module.css";

export const metadata: Metadata = { title: "Uživatelé a škola" };

export default async function AdminPage() {
  await requireAdmin();
  const users = await listUsers();
  const activities = await listActivities();
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? "";

  const students = users.filter((u) => u.role === "student").length;
  const staff = users.length - students;
  const offered = activities.filter((a) => a.kind !== "ostatni");

  return (
    <>
      <PageHeader eyebrow="Správa školy" title="Uživatelé a škola" />

      <div className={styles.stats}>
        <Stat label="Studenti" value={students} />
        <Stat label="Učitelé a admini" value={staff} />
        <Stat label="Kurzy a ateliéry" value={offered.length} />
        <Stat label="Odkazy na Meet" value={`${activities.filter((a) => a.meetUrl).length} / ${activities.length}`} />
      </div>

      <AdminTabs
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          group: u.group,
          active: u.active,
          initials: initials(u.name),
        }))}
        courses={offered.map((a) => ({
          id: a.id,
          kind: KIND_LABEL[a.kind],
          kindKey: a.kind,
          title: a.title,
          lector: nameOf(a.teacherId),
          when: formatSlots(a.slots),
          taken: a.studentIds.length,
          cap: a.capacity ?? a.studentIds.length,
          meetUrl: a.meetUrl,
        }))}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className={`card ${styles.stat}`}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
  );
}
