import { activityRange, runsOn } from "./periods";
import type { Activity, Slot } from "./types";
import { addDays, isoWeekdayOf, sameDate, toIso, toMinutes, type PlainDate, type PragueNow } from "./time";

/** Vrátí true pro dny, kdy běžná výuka neprobíhá (týden expedic). */
export type DayBlocker = (date: PlainDate | string) => boolean;
const NO_BLOCK: DayBlocker = () => false;

/**
 * Dny expedic. Expedice jsou pro celou školu ve stejném týdnu a v jejich dnech
 * neprobíhají kurzy, ateliéry ani události — rozvrh ukáže jen expedice.
 * Bere všechny aktivity školy (ne jen uživatelovy).
 */
export function expeditionBlocker(all: Activity[]): DayBlocker {
  const ranges = all
    .filter((a) => a.kind === "expedice")
    .map((a) => activityRange(a))
    .filter((r): r is { from: string; to: string } => !!r.from && !!r.to);
  if (ranges.length === 0) return NO_BLOCK;
  return (d) => {
    const iso = typeof d === "string" ? d : toIso(d);
    return ranges.some((r) => iso >= r.from && iso <= r.to);
  };
}

export type ScheduleEntry = {
  activity: Activity;
  slot: Slot;
  date: PlainDate;
  live: boolean;
  past: boolean;
  /** Vlastní odkaz (konzultace) místo detailu aktivity */
  href?: string;
  /** Vlastní barva bloku (konzultace) místo druhu aktivity */
  styleKind?: string;
};

/** Konzultace jako bloky v týdenním rozvrhu (pátek). */
export function consultationEntries(
  items: { id: string; day: string; start: string; end: string; title: string; meetUrl: string | null }[],
  monday: PlainDate,
  now: PragueNow,
): ScheduleEntry[] {
  return items
    .filter((c) => c.day >= toIso(monday) && c.day <= toIso(addDays(monday, 4)))
    .map((c) => {
      const slot: Slot = { day: 5, start: c.start, end: c.end };
      const date = addDays(monday, 4);
      const activity: Activity = {
        id: `konzultace-${c.id}`,
        kind: "ostatni",
        title: c.title,
        teacherId: "",
        location: null,
        period: null,
        startsOn: c.day,
        endsOn: c.day,
        meetUrl: c.meetUrl,
        allowedGrades: null,
        slots: [slot],
        studentIds: [],
        tone: "teal",
      };
      return { activity, slot, date, ...status(date, slot, now), href: "/konzultace", styleKind: "konzultace" };
    });
}

/** Hodiny pro pracovní týden začínající pondělím `monday`. */
export function weekEntries(activities: Activity[], monday: PlainDate, now: PragueNow, blocked: DayBlocker = NO_BLOCK): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  for (const activity of activities) {
    for (const slot of activity.slots) {
      const date = addDays(monday, slot.day - 1);
      // Hodiny jen v době, kdy aktivita běží (kurzové období, termín ateliéru).
      if (!runsOn(activity, date)) continue;
      if (activity.kind !== "expedice" && blocked(date)) continue;
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
export function currentOrNext(activities: Activity[], now: PragueNow, blocked: DayBlocker = NO_BLOCK): ScheduleEntry | null {
  for (let i = 0; i < 8; i++) {
    const date = addDays(now, i);
    const wd = isoWeekdayOf(date);
    if (wd > 5) continue;
    const candidates = activities
      .filter((activity) => runsOn(activity, date) && (activity.kind === "expedice" || !blocked(date)))
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

/** Probíhá teď některá z hodin aktivity? */
export function isLiveNow(activity: Activity, now: PragueNow, blocked: DayBlocker = NO_BLOCK): boolean {
  if (!runsOn(activity, now)) return false;
  if (activity.kind !== "expedice" && blocked(now)) return false;
  return activity.slots.some(
    (s) => s.day === now.isoWeekday && now.minutes >= toMinutes(s.start) && now.minutes < toMinutes(s.end),
  );
}

export type AllDayEntry = { activity: Activity; days: number[]; from: string; to: string };

/**
 * Vícedenní akce bez rozvrhu (expedice, výjezdní ateliér) v daném týdnu:
 * ve kterých dnech po–pá probíhají.
 */
export function weekAllDay(activities: Activity[], monday: PlainDate): AllDayEntry[] {
  const out: AllDayEntry[] = [];
  for (const activity of activities) {
    if (activity.slots.length > 0 || (!activity.startsOn && !activity.endsOn)) continue;
    const days = [1, 2, 3, 4, 5].filter((d) => runsOn(activity, addDays(monday, d - 1)));
    if (days.length === 0) continue;
    const r = activityRange(activity);
    out.push({ activity, days, from: r.from ?? toIso(monday), to: r.to ?? toIso(addDays(monday, 4)) });
  }
  return out;
}

/** Dny týdne (1 = po … 5 = pá), kdy je expedice a uživatel sám na žádné není. */
export function blockedWeekdays(monday: PlainDate, blocked: DayBlocker, allDay: AllDayEntry[]): number[] {
  return [1, 2, 3, 4, 5].filter(
    (d) => blocked(addDays(monday, d - 1)) && !allDay.some((e) => e.activity.kind === "expedice" && e.days.includes(d)),
  );
}
