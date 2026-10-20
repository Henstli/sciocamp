import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { ConsultationBoard, type BoardCell } from "@/components/consultations/ConsultationBoard";
import { MyConsultations, type ConsultationView } from "@/components/consultations/MyConsultations";
import { TeacherAvailability, type OwnCell } from "@/components/consultations/TeacherAvailability";
import { requireUser } from "@/lib/auth";
import {
  SLOTS,
  bookableFridays,
  formatFriday,
  formatSpan,
  scheduleConflict,
  slotEnd,
  type Consultation,
} from "@/lib/consultations";
import { listActivities, listStaff, listUsers } from "@/lib/data";
import { consultationBoard, listConsultationBlocks, listConsultationRules, myConsultations } from "@/lib/data-consultations";
import { canTeach, initials } from "@/lib/roles";
import { expeditionBlocker } from "@/lib/schedule";
import { addDays, parseIso, pragueNow, toIso, toMinutes } from "@/lib/time";
import styles from "./konzultace.module.css";

export const metadata: Metadata = { title: "Konzultace" };

const covers = (c: { start: string; end: string }, slot: string) => c.start <= slot && slot < c.end;

export default async function ConsultationsPage() {
  const user = await requireUser();
  const now = pragueNow();
  const today = toIso(now);
  const fridays = bookableFridays(today, now.minutes);
  const until = toIso(addDays(parseIso(today)!, 60));
  const [staff, users, activities, rules, blocks, board, mine] = await Promise.all([
    listStaff(),
    listUsers(),
    listActivities(),
    listConsultationRules(),
    listConsultationBlocks(fridays),
    consultationBoard(fridays[0] ?? today, fridays.at(-1) ?? today),
    myConsultations(user, today, until),
  ]);
  const teachers = staff.filter((t) => t.id !== user.id).sort((a, b) => a.name.localeCompare(b.name, "cs"));
  const expeditionDay = expeditionBlocker(activities);
  const isPast = (day: string, slot: string) => day === today && toMinutes(slot) <= now.minutes;
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? "Bývalý člen školy";
  const teaching = canTeach(user.role);

  /** Proč učitel blok nenabízí (null = nabízí). */
  const teacherOff = (tid: string, day: string, slot: string): string | null => {
    if (blocks.some((b) => b.teacherId === tid && b.day === day && b.slot === null)) return "Tento pátek konzultace nemá";
    if (blocks.some((b) => b.teacherId === tid && b.day === day && b.slot === slot)) return "Tento čas zrušil(a)";
    if (rules.some((r) => r.teacherId === tid && r.slot === slot)) return "V tuto dobu konzultace nenabízí";
    const c = scheduleConflict(tid, activities, day, slot, slotEnd(slot), expeditionDay);
    return c ? `Má ${c}` : null;
  };

  // Student: tabulka volných bloků u všech vyučujících.
  const myOwn = (c: Consultation) => c.studentId === user.id || c.guestIds.includes(user.id);
  const grid: BoardCell[][][] = teaching
    ? []
    : fridays.map((day) =>
        teachers.map((t) =>
          SLOTS.map((slot): BoardCell => {
            if (isPast(day, slot)) return { k: "past" };
            const booked = mine.find((c) => c.day === day && c.teacherId === t.id && c.studentId === user.id && covers(c, slot));
            if (booked) return { k: "mine", id: booked.id };
            const off = teacherOff(t.id, day, slot);
            if (off) return { k: "off", why: off };
            if (board.some((b) => b.personId === t.id && b.day === day && covers(b, slot))) return { k: "taken" };
            const clash = mine.find((c) => c.day === day && myOwn(c) && covers(c, slot));
            if (clash) return { k: "clash", why: `Máš konzultaci ${formatSpan(clash.start, clash.end)} (${nameOf(clash.teacherId)})` };
            const sched = scheduleConflict(user.id, activities, day, slot, slotEnd(slot), expeditionDay);
            if (sched) return { k: "clash", why: `Máš ${sched}` };
            return { k: "free" };
          }),
        ),
      );

  // Proč student v daném řádku nemůže (u všech vyučujících stejně).
  const rowNotes: (string | null)[][] = teaching
    ? []
    : fridays.map((day) =>
        SLOTS.map((slot) => {
          if (isPast(day, slot)) return null;
          const clash = mine.find((c) => c.day === day && myOwn(c) && covers(c, slot));
          if (clash) return `konzultace (${nameOf(clash.teacherId).split(" ")[0]})`;
          return scheduleConflict(user.id, activities, day, slot, slotEnd(slot), expeditionDay);
        }),
      );

  // Vyučující: vlastní pátky (zapsané, zrušené, pravidelně nedostupné, rozvrh).
  const own: OwnCell[][] = teaching
    ? fridays.map((day) =>
        SLOTS.map((slot): OwnCell => {
          const c = mine.find((x) => x.day === day && x.teacherId === user.id && covers(x, slot));
          if (c) return { k: "booked", who: nameOf(c.studentId), past: isPast(day, slot) };
          const guest = mine.find((x) => x.day === day && x.guestIds.includes(user.id) && covers(x, slot));
          if (guest) return { k: "guest", who: nameOf(guest.teacherId), past: isPast(day, slot) };
          if (isPast(day, slot)) return { k: "past" };
          if (blocks.some((b) => b.teacherId === user.id && b.day === day && b.slot === null)) return { k: "day" };
          if (blocks.some((b) => b.teacherId === user.id && b.day === day && b.slot === slot)) return { k: "block" };
          if (rules.some((r) => r.teacherId === user.id && r.slot === slot)) return { k: "rule" };
          const sched = scheduleConflict(user.id, activities, day, slot, slotEnd(slot), expeditionDay);
          if (sched) return { k: "busy", why: sched };
          return { k: "free" };
        }),
      )
    : [];

  const views: ConsultationView[] = mine.map((c) => ({
    id: c.id,
    day: c.day,
    dayLabel: formatFriday(c.day),
    span: formatSpan(c.start, c.end),
    meetUrl: c.meetUrl,
    teacher: { id: c.teacherId, name: nameOf(c.teacherId) },
    student: { id: c.studentId, name: nameOf(c.studentId) },
    guests: c.guestIds.map((g) => ({ id: g, name: nameOf(g) })),
    role: c.teacherId === user.id ? "teacher" : c.studentId === user.id ? "student" : "guest",
    canCancel: c.teacherId === user.id || c.studentId === user.id,
  }));
  const people = users
    .filter((u) => u.id !== user.id)
    .map((u) => ({ id: u.id, name: u.name, sub: u.role === "student" ? u.group : "Vyučující", initials: initials(u.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));

  return (
    <>
      <PageHeader
        title="Konzultace"
        subtitle={
          teaching
            ? "Studenti si u tebe zapisují 15minutové bloky v pátek 8:30–12:00, nejvýš dva týdny dopředu."
            : "Zapiš si 15minutové bloky u kohokoli z vyučujících — v pátek 8:30–12:00, nejvýš dva týdny dopředu."
        }
        avatar={{ initials: initials(user.name), name: user.name }}
      />
      <div className={styles.page}>
        <MyConsultations items={views} people={people} />
        {teaching ? (
          <TeacherAvailability
            fridays={fridays.map((d) => ({ day: d, label: formatFriday(d) }))}
            slots={SLOTS}
            cells={own}
            rules={rules.filter((r) => r.teacherId === user.id).map((r) => r.slot)}
          />
        ) : (
          <ConsultationBoard
            fridays={fridays.map((d) => ({ day: d, label: formatFriday(d) }))}
            slots={SLOTS}
            teachers={teachers.map((t) => ({ id: t.id, name: t.name, short: shortName(t.name, teachers), initials: initials(t.name) }))}
            grid={grid}
            rowNotes={rowNotes}
          />
        )}
      </div>
    </>
  );
}

/** Křestní jméno; když ho má víc vyučujících, přidá první písmeno příjmení („Tereza H.“). */
function shortName(name: string, all: { name: string }[]): string {
  const first = name.split(" ")[0];
  const same = all.filter((u) => u.name.split(" ")[0] === first).length > 1;
  return same ? `${first} ${name.split(" ").at(-1)?.[0] ?? ""}.` : first;
}
