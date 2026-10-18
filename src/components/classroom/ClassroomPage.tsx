import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "../Icon";
import { MeetLink } from "../MeetLink";
import { ClassTabs, type ClassView } from "./ClassTabs";
import { requireUser } from "@/lib/auth";
import { canOpenActivity, getActivity, getClassroom, getUsersByIds, teachesActivity } from "@/lib/data";
import { plural } from "@/lib/format";
import { KIND_LABEL } from "@/lib/links";
import { initials } from "@/lib/roles";
import { currentOrNext } from "@/lib/schedule";
import { DAYS_SHORT, formatRange, formatSlots, isoWeekdayOf, pragueNow } from "@/lib/time";
import type { ActivityKind, User } from "@/lib/types";
import styles from "./classroom.module.css";

/** Detail třídy ve stylu Google Classroomu (návrh: design/Trida.dc.html). */
export async function ClassroomPage({ id, kinds, back }: { id: string; kinds: ActivityKind[]; back: { href: string; label: string } }) {
  const user = await requireUser();
  const activity = await getActivity(id);
  if (!activity || !kinds.includes(activity.kind) || !canOpenActivity(user, activity)) notFound();

  const now = pragueNow();
  const content = await getClassroom(activity);
  const [teacher] = await getUsersByIds([activity.teacherId]);
  const students = await getUsersByIds(activity.studentIds);
  const authorIds = new Set<string>([
    ...content.chat.map((m) => m.authorId),
    ...content.stream.flatMap((s) => (s.type === "post" ? [s.authorId] : [])),
  ]);
  const authors = await getUsersByIds([...authorIds]);
  const person = (u: User | undefined) =>
    u ? { id: u.id, name: u.name, initials: initials(u.name), role: u.role } : { id: "?", name: "Neznámý uživatel", initials: "?", role: "student" as const };
  const byId = (uid: string) => person(authors.find((a) => a.id === uid) ?? students.find((s) => s.id === uid));

  const isTeacher = teachesActivity(user, activity);
  const next = currentOrNext([activity], now);
  const feminine = teacher && /(ová|á)$/.test(teacher.name);
  const lectorWord = activity.kind === "atelier" ? (feminine ? "lektorce" : "lektorovi") : feminine ? "vyučující" : "vyučujícímu";

  const view: ClassView = {
    me: person(user),
    teacher: person(teacher),
    teacherLabel: activity.kind === "atelier" ? (feminine ? "Lektorka ateliéru" : "Lektor ateliéru") : "Vyučující kurzu",
    stream: content.stream.map((s) =>
      s.type === "post" ? { ...s, author: byId(s.authorId) } : { ...s, author: null },
    ),
    topics: content.topics,
    teams: content.teams.map((t) => ({
      name: t.name,
      members: t.memberIds.map((m) => byId(m).name.split(" ")[0]).join(", "),
    })),
    students: students.map(person),
    chat: content.chat.map((m) => ({ ...m, author: byId(m.authorId) })),
    upcoming: content.upcoming,
    next: next
      ? {
          label: next.live
            ? `Právě probíhá · ${formatRange(next.slot)}`
            : `${DAYS_SHORT[isoWeekdayOf(next.date) - 1]} ${next.date.d}. ${next.date.m}. · ${formatRange(next.slot)}`,
          live: next.live,
        }
      : null,
    room: activity.room,
    meetUrl: activity.meetUrl,
    canEditMeet: isTeacher,
    slug: activity.id,
    kindLabel: activity.kind === "atelier" ? "ateliéru" : "kurzu",
  };

  return (
    <>
      <Link href={back.href} className={styles.back}>
        <Icon name="chevronLeft" size={16} strokeWidth={2.2} />
        {back.label}
      </Link>

      <section className={styles.hero}>
        <div aria-hidden="true" className={`${styles.blob} ${styles.blob1}`} />
        <div aria-hidden="true" className={`${styles.blob} ${styles.blob2}`} />
        <div className={styles.heroText}>
          <div className={styles.heroMeta}>
            {[KIND_LABEL[activity.kind], formatSlots(activity.slots), activity.room].filter(Boolean).join(" · ")}
          </div>
          <h1 className={styles.heroTitle}>{activity.title}</h1>
          <div className={styles.heroSub}>
            {teacher?.name} · {students.length} {plural(students.length, "student", "studenti", "studentů")}
          </div>
        </div>
        <div className={styles.heroActions}>
          {!isTeacher && (
            <Link href="/zpravy" className={`btn ${styles.heroBtn}`}>
              <Icon name="chat" size={18} />
              Napsat {lectorWord}
            </Link>
          )}
          <MeetLink
            url={activity.meetUrl}
            variant="white"
            label={isTeacher ? "Zahájit Meet" : "Připojit se přes Meet"}
          />
        </div>
      </section>

      <ClassTabs view={view} />
    </>
  );
}
