import type { Metadata } from "next";
import Link from "next/link";
import { ClassCard } from "@/components/ClassCard";
import { EmptyNote, PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { activitiesForUser, getUsersByIds, listActivities } from "@/lib/data";
import { plural } from "@/lib/format";
import { initials, isAdmin } from "@/lib/roles";
import { isLiveNow } from "@/lib/schedule";
import { pragueNow } from "@/lib/time";
import styles from "../classes.module.css";

export const metadata: Metadata = { title: "Kurzy" };

export default async function CoursesPage() {
  const user = await requireUser();
  const now = pragueNow();

  // Admin vidí celou nabídku, ostatní kurzy, které navštěvují nebo učí.
  const courses = isAdmin(user.role)
    ? (await listActivities()).filter((a) => a.kind === "kurz")
    : await activitiesForUser(user, "kurz");
  const teachers = await getUsersByIds([...new Set(courses.map((c) => c.teacherId))]);
  const teacherOf = (id: string) => teachers.find((t) => t.id === id) ?? null;

  const subtitle =
    user.role === "student"
      ? `Blok 1 · ${courses.length} ${plural(courses.length, "kurz", "kurzy", "kurzů")}, do kterých chodíš`
      : user.role === "admin"
        ? `Blok 1 · všech ${courses.length} ${plural(courses.length, "kurz", "kurzy", "kurzů")} v nabídce`
        : `Blok 1 · ${courses.length} ${plural(courses.length, "kurz", "kurzy", "kurzů")}, které učíš`;

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
              live={isLiveNow(c, now)}
            />
          ))}
        </div>
      )}
    </>
  );
}
