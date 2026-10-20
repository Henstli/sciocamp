// Konzultace: 15minutové bloky v pátek 8:30–12:00, nejvýš dva týdny dopředu.
// Výpočet stavu bloků (volno, obsazeno, nedostupné, kolize) pro tabulku.
// Skutečný zápis hlídá databáze (book_consultation).

import { runsOn } from "./periods";
import type { DayBlocker } from "./schedule";
import { addDays, isoWeekdayOf, parseIso, toIso, toMinutes } from "./time";
import type { Activity } from "./types";

export const SLOT_MINUTES = 15;
export const FIRST_SLOT = "08:30";
export const LAST_END = "12:00";
export const DAYS_AHEAD = 14;

/** Začátky bloků: 08:30, 08:45, … 11:45 */
export const SLOTS: string[] = Array.from({ length: (toMinutes(LAST_END) - toMinutes(FIRST_SLOT)) / SLOT_MINUTES }, (_, i) =>
  fromMinutes(toMinutes(FIRST_SLOT) + i * SLOT_MINUTES),
);

export function fromMinutes(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function slotEnd(slot: string): string {
  return fromMinutes(toMinutes(slot) + SLOT_MINUTES);
}

/** „9:00–9:45“ */
export function formatSpan(start: string, end: string): string {
  const f = (t: string) => t.replace(/^0/, "").slice(0, 5);
  return `${f(start)}–${f(end)}`;
}

/** „pá 23. 10.“ */
export function formatFriday(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `pá ${d}. ${m}.`;
}

/** Pátky, na které se dá zapsat: od dneška do 14 dní (dnešní jen do 12:00). */
export function bookableFridays(todayIso: string, nowMinutes: number): string[] {
  const today = parseIso(todayIso)!;
  const out: string[] = [];
  for (let i = 0; i <= DAYS_AHEAD; i++) {
    const d = addDays(today, i);
    if (isoWeekdayOf(d) !== 5) continue;
    if (i === 0 && nowMinutes >= toMinutes(LAST_END)) continue;
    out.push(toIso(d));
  }
  return out;
}

/** Sousední bloky → souvislé úseky: ["09:00","09:15","10:00"] → [[09:00,09:30],[10:00,10:15]] */
export function toRanges(slots: string[]): [string, string][] {
  const sorted = [...new Set(slots)].sort();
  const out: [string, string][] = [];
  for (const s of sorted) {
    const last = out.at(-1);
    if (last && last[1] === s) last[1] = slotEnd(s);
    else out.push([s, slotEnd(s)]);
  }
  return out;
}

export type Consultation = {
  id: string;
  teacherId: string;
  studentId: string;
  /** „rrrr-mm-dd“ (pátek) */
  day: string;
  /** „hh:mm“ */
  start: string;
  end: string;
  meetUrl: string | null;
  guestIds: string[];
};

/** Obsazený čas člověka (konzultace, kde učí / je pozvaný) — bez jmen. */
export type BusySpan = { personId: string; day: string; start: string; end: string };

export type SlotState =
  | { kind: "free" }
  | { kind: "mine"; consultationId: string }
  | { kind: "taken" }
  | { kind: "off"; reason: string }
  | { kind: "past" };

const overlaps = (s1: string, e1: string, s2: string, e2: string) => s1 < e2 && s2 < e1;

/** Proč má člověk v pátek `day` mezi start–end obsazeno rozvrhem nebo expedicí (null = volno). */
export function scheduleConflict(
  personId: string,
  activities: Activity[],
  day: string,
  start: string,
  end: string,
  expeditionDay: DayBlocker,
): string | null {
  const date = parseIso(day)!;
  const monday = addDays(date, -4);
  const mine = activities.filter((a) => a.teacherId === personId || (a.coTeacherIds ?? []).includes(personId) || a.studentIds.includes(personId));
  // Expedice kdykoli v týdnu toho pátku → celý týden bez konzultací.
  const trip = mine.find((a) => a.kind === "expedice" && [0, 1, 2, 3, 4].some((i) => runsOn(a, addDays(monday, i))));
  if (trip) return `expedice ${trip.title}`;
  if (expeditionDay(date)) return null; // v týdnu expedic se běžná výuka nekoná
  for (const a of mine) {
    if (!runsOn(a, date)) continue;
    const slot = a.slots.find((s) => s.day === 5 && overlaps(s.start.slice(0, 5), s.end.slice(0, 5), start, end));
    if (slot) return `${a.title} ${formatSpan(slot.start, slot.end)}`;
  }
  return null;
}
