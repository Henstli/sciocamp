import type { Activity, Slot } from "./types";
import { addDays, isoWeekdayOf, sameDate, toMinutes, type PlainDate, type PragueNow } from "./time";

export type ScheduleEntry = {
  activity: Activity;
  slot: Slot;
  date: PlainDate;
  live: boolean;
  past: boolean;
};

/** Hodiny pro pracovní týden začínající pondělím `monday`. */
export function weekEntries(activities: Activity[], monday: PlainDate, now: PragueNow): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  for (const activity of activities) {
    for (const slot of activity.slots) {
      const date = addDays(monday, slot.day - 1);
      entries.push({ activity, slot, date, ...status(date, slot, now) });
    }
  }
  return entries.sort((a, b) => a.slot.day - b.slot.day || toMinutes(a.slot.start) - toMinutes(b.slot.start));
}

function status(date: PlainDate, slot: Slot, now: PragueNow) {
  const today = sameDate(date, now);
  const start = toMinutes(slot.start);
  const end = toMinutes(slot.end);
  const before = date.y * 10000 + date.m * 100 + date.d < now.y * 10000 + now.m * 100 + now.d;
  return {
    live: today && now.minutes >= start && now.minutes < end,
    past: before || (today && now.minutes >= end),
  };
}

/** Právě probíhající hodina, jinak nejbližší další (do týdne dopředu). */
export function currentOrNext(activities: Activity[], now: PragueNow): ScheduleEntry | null {
  for (let i = 0; i < 8; i++) {
    const date = addDays(now, i);
    const wd = isoWeekdayOf(date);
    if (wd > 5) continue;
    const candidates = activities
      .flatMap((activity) => activity.slots.filter((s) => s.day === wd).map((slot) => ({ activity, slot })))
      .map((c) => ({ ...c, date, ...status(date, c.slot, now) }))
      .filter((e) => !e.past)
      .sort((a, b) => toMinutes(a.slot.start) - toMinutes(b.slot.start));
    if (candidates.length) return candidates[0];
  }
  return null;
}

/** Rozsah hodin, které má mřížka rozvrhu ukázat (aspoň 8:00–14:00). */
export function hourRange(entries: ScheduleEntry[]): { from: number; to: number } {
  let from = 8;
  let to = 14;
  for (const e of entries) {
    from = Math.min(from, Math.floor(toMinutes(e.slot.start) / 60));
    to = Math.max(to, Math.ceil(toMinutes(e.slot.end) / 60));
  }
  return { from, to };
}
