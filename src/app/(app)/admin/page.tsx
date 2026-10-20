import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { isSupabase } from "@/lib/config";
import { listActivities, listPeriods, listTerms, listUsers } from "@/lib/data";
import { activityPhase, currentPeriod, describeWhen, hasEnded } from "@/lib/periods";
import { KIND_LABEL, activityHref } from "@/lib/links";
import { canTeach, initials } from "@/lib/roles";
import { formatDue, isoToPragueLocal, nowMs, pragueNow, toIso } from "@/lib/time";
import { readyTeachers } from "@/lib/data-enroll";
import { storageReport } from "@/lib/storage-cleanup";
import { listAnnouncements } from "@/lib/data-announcements";
import { AUDIENCE_LABEL, announcementActive } from "@/lib/announcements";
import { AnnouncementManager } from "@/components/announcements/AnnouncementManager";
import { AdminTabs } from "./AdminTabs";
import { PeriodManager } from "./PeriodManager";
import { StorageManager, type StorageView } from "./StorageManager";
import { TermManager } from "./TermManager";
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
  const offered = activities.filter(
    (a) => a.kind === "kurz" || a.kind === "atelier",
  );

  const terms = await listTerms();
  const storage = await loadStorage();
  const announcements = await listAnnouncements();
  // Připravené ateliéry a expedice (do zápisu se dají vyhlásit spolu s kurzy).
  const freeOf = (a: (typeof activities)[number]) =>
    !(a.round && a.round.closesAt > new Date(nowMs()).toISOString());
  const readyCounts = {
    ateliers: activities.filter(
      (a) => a.kind === "atelier" && a.announceReady && freeOf(a),
    ).length,
    expeditions: activities.filter(
      (a) => a.kind === "expedice" && a.announceReady && freeOf(a),
    ).length,
  };
  const nextPeriodId = [...periods].filter((p) => p.startsOn > today).sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0]?.id ?? null;
  // Připravenost učitelů u období, která ještě neskončila.
  const periodRows = await Promise.all(
    periods.map(async (p) => {
      const courses = activities.filter(
        (a) => a.kind === "kurz" && a.period?.id === p.id,
      );
      const ready = new Set(p.endsOn >= today ? await readyTeachers(p.id) : []);
      const teacherIds = new Set([
        ...users.filter((u) => canTeach(u.role)).map((u) => u.id),
        ...courses.map((c) => c.teacherId),
      ]);
      return {
        id: p.id,
        name: p.name,
        startsOn: p.startsOn,
        endsOn: p.endsOn,
        enrollOpens: p.enrollOpensAt ? isoToPragueLocal(p.enrollOpensAt) : "",
        enrollCloses: p.enrollClosesAt
          ? isoToPragueLocal(p.enrollClosesAt)
          : "",
        enrollOpensAt: p.enrollOpensAt ?? null,
        enrollClosesAt: p.enrollClosesAt ?? null,
        published: !!p.publishedAt,
        ended: p.endsOn < today,
        // Nejbližší příští období: jen u něj se řeší připravenost a zveřejnění.
        nearest: p.id === nextPeriodId,
        current:
          p.id === current?.id && p.startsOn <= today && today <= p.endsOn,
        activities: activities.filter((a) => a.period?.id === p.id).length,
        courses: courses.length,
        drafts: courses.filter((c) => c.published === false).length,
        teachers: [...teacherIds]
          .map((id) => ({
            id,
            name: nameOf(id),
            courses: courses.filter((c) => c.teacherId === id).length,
            ready: ready.has(id),
          }))
          .filter((t) => t.name)
          .sort((a, b) => a.name.localeCompare(b.name, "cs")),
      };
    }),
  );

  return (
    <>
      <PageHeader eyebrow="Správa školy" title="Uživatelé a škola" />

      <div className={styles.stats}>
        <Stat label="Studenti" value={students} />
        <Stat label="Učitelé a admini" value={staff} />
        <Stat label="Kurzy a ateliéry" value={offered.length} />
        <Stat
          label="Odkazy na Meet"
          value={`${activities.filter((a) => a.meetUrl).length} / ${activities.length}`}
        />
      </div>

      <AdminTabs
        live={isSupabase}
        initialTab={
          tab === "kurzy"
            ? "kurz"
            : tab === "ateliery"
              ? "atelier"
              : tab === "udalosti"
                ? "ostatni"
                : tab === "expedice"
                  ? "expedice"
                  : tab === "obdobi"
                    ? "periods"
                    : tab === "uloziste"
                      ? "storage"
                      : tab === "oznameni"
                        ? "announcements"
                        : "users"
        }
        storageTab={<StorageManager report={storage.report} problem={storage.problem} />}
        announcementsTab={
          <AnnouncementManager
            live={isSupabase}
            items={announcements.map((a) => {
              const active = announcementActive(a, nowMs());
              return {
                id: a.id,
                title: a.title,
                audience: AUDIENCE_LABEL[a.audience],
                author: nameOf(a.createdBy) || "Admin",
                ended: !active,
                status: active ? (a.endsAt ? `Na Domově do ${formatDue(a.endsAt)}` : "Na Domově") : "Ukončeno",
              };
            })}
          />
        }
        periodsTab={
          <div className={styles.periodsStack}>
            <PeriodManager periods={periodRows} ready={readyCounts} />
            <TermManager
              terms={terms.map((t) => ({
                ...t,
                used: activities.filter((a) => a.termId === t.id).length,
                ended: t.endsOn < today,
              }))}
            />
          </div>
        }
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          group: u.group,
          grade: u.grade ?? null,
          active: u.active,
          initials: initials(u.name),
        }))}
        courses={[...activities]
          .sort(
            (x, y) =>
              (x.startsOn ?? x.period?.startsOn ?? "").localeCompare(
                y.startsOn ?? y.period?.startsOn ?? "",
              ) || x.title.localeCompare(y.title, "cs"),
          )
          .map((a) => ({
            id: a.id,
            href: activityHref(a),
            ended: hasEnded(a, today),
            phase: hasEnded(a, today) ? null : activityPhase(a, today),
            kind: KIND_LABEL[a.kind],
            kindKey: a.kind,
            title: a.title,
            lector: nameOf(a.teacherId),
            when: [a.kind === "kurz" || a.kind === "atelier" ? a.period?.name : null, describeWhen(a)].filter(Boolean).join(" · "),
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

async function loadStorage(): Promise<{ report: StorageView | null; problem?: string }> {
  if (!isSupabase) return { report: null, problem: "V ukázkovém režimu se soubory neukládají." };
  if (!process.env.SUPABASE_SECRET_KEY) return { report: null, problem: "Chybí SUPABASE_SECRET_KEY, přehled úložiště nejde načíst." };
  try {
    return { report: await storageReport() };
  } catch {
    return { report: null };
  }
}
