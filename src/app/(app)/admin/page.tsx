import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { isSupabase } from "@/lib/config";
import { listActivities, listPeriods, listUsers } from "@/lib/data";
import { currentPeriod, describeWhen } from "@/lib/periods";
import { KIND_LABEL } from "@/lib/links";
import { initials } from "@/lib/roles";
import { pragueNow, toIso } from "@/lib/time";
import { AdminTabs } from "./AdminTabs";
import { PeriodManager } from "./PeriodManager";
import styles from "./admin.module.css";

export const metadata: Metadata = { title: "Uživatelé a škola" };

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const { tab } = await searchParams;
  const users = await listUsers();
  const activities = await listActivities();
  const periods = await listPeriods();
  const today = toIso(pragueNow());
  const current = currentPeriod(periods, today);
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
        live={isSupabase}
        initialTab={tab === "kurzy" ? "courses" : tab === "obdobi" ? "periods" : "users"}
        periodsTab={
          <PeriodManager
            periods={periods.map((p) => ({
              ...p,
              current: p.id === current?.id && p.startsOn <= today && today <= p.endsOn,
              activities: activities.filter((a) => a.period?.id === p.id).length,
            }))}
          />
        }
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
          when: [a.period?.name, describeWhen(a)].filter(Boolean).join(" · "),
          taken: a.studentIds.length,
          cap: a.capacity ?? null,
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
