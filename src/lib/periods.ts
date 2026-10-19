// Trvání aktivit a kurzová období (čisté funkce, běží na serveru i v prohlížeči).
//
// Kurz trvá celé kurzové období. Ateliér a ostatní akce (expedice) mohou mít
// vlastní od–do; když ho nemají, platí data období. Bez období i bez dat
// aktivita platí pořád (např. třídnická hodina).

import type { Activity, Period } from "./types";
import { formatSlots, toIso, type PlainDate } from "./time";

export type DateRange = { from: string | null; to: string | null };

export function activityRange(a: Pick<Activity, "startsOn" | "endsOn" | "period">): DateRange {
  return {
    from: a.startsOn ?? a.period?.startsOn ?? null,
    to: a.endsOn ?? a.period?.endsOn ?? null,
  };
}

/** Běží aktivita v daný den („rrrr-mm-dd“ nebo PlainDate)? */
export function runsOn(a: Pick<Activity, "startsOn" | "endsOn" | "period">, day: string | PlainDate): boolean {
  const iso = typeof day === "string" ? day : toIso(day);
  const r = activityRange(a);
  return (!r.from || iso >= r.from) && (!r.to || iso <= r.to);
}

export function hasEnded(a: Pick<Activity, "startsOn" | "endsOn" | "period">, todayIso: string): boolean {
  const { to } = activityRange(a);
  return !!to && to < todayIso;
}

export function hasStarted(a: Pick<Activity, "startsOn" | "endsOn" | "period">, todayIso: string): boolean {
  const { from } = activityRange(a);
  return !from || from <= todayIso;
}

/** Překrývají se dva rozsahy (včetně krajních dnů)? */
export function overlaps(x: DateRange, y: DateRange): boolean {
  return (!x.from || !y.to || x.from <= y.to) && (!y.from || !x.to || y.from <= x.to);
}

/** Období, které právě běží; jinak nejbližší budoucí; jinak poslední. */
export function currentPeriod(periods: Period[], todayIso: string): Period | null {
  const sorted = [...periods].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  return (
    sorted.find((p) => p.startsOn <= todayIso && todayIso <= p.endsOn) ??
    sorted.find((p) => p.startsOn > todayIso) ??
    sorted.at(-1) ??
    null
  );
}

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

/** „21.–23. 10.“, „28. 9. – 2. 10.“, „21. 10.“; s rokem, když se liší od letoška. */
export function formatDateRange(from: string | null, to: string | null, currentYear?: number): string {
  if (!from && !to) return "";
  if (from && !to) return `od ${formatDay(from, currentYear)}`;
  if (!from && to) return `do ${formatDay(to, currentYear)}`;
  const a = parts(from!);
  const b = parts(to!);
  const year = currentYear && b.y !== currentYear ? ` ${b.y}` : "";
  if (from === to) return `${a.d}. ${a.m}.${year}`;
  if (a.y === b.y && a.m === b.m) return `${a.d}.–${b.d}. ${b.m}.${year}`;
  if (a.y === b.y) return `${a.d}. ${a.m}. – ${b.d}. ${b.m}.${year}`;
  return `${a.d}. ${a.m}. ${a.y} – ${b.d}. ${b.m}. ${b.y}`;
}

function formatDay(iso: string, currentYear?: number) {
  const p = parts(iso);
  return `${p.d}. ${p.m}.${currentYear && p.y !== currentYear ? ` ${p.y}` : ""}`;
}

/** Počet dní akce včetně krajních („3 dny“ u expedice). */
export function dayCount(from: string, to: string): number {
  const a = parts(from);
  const b = parts(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000) + 1;
}

/**
 * Kdy aktivita probíhá, pro karty a hlavičky: u kurzu rozvrh, u ateliéru
 * a akcí i termín („5.–30. 10. · Po 9:00–11:30“, „21.–23. 10.“).
 */
export function describeWhen(a: Pick<Activity, "kind" | "slots" | "startsOn" | "endsOn" | "period">, currentYear?: number): string {
  const slots = formatSlots(a.slots);
  if (a.kind === "kurz" && !a.startsOn && !a.endsOn) return slots;
  const r = activityRange(a);
  const dates = formatDateRange(r.from, r.to, currentYear);
  return [dates, slots].filter(Boolean).join(" · ");
}

/**
 * Ateliér a expedice: kteří studenti jsou ve stejné době už v jiném ateliéru
 * (resp. na jiné expedici) — id studenta → název. U kurzů a událostí prázdné.
 */
export function atelierConflicts(activity: Activity, all: Activity[]): Record<string, string> {
  if (activity.kind !== "atelier" && activity.kind !== "expedice") return {};
  const range = activityRange(activity);
  const out: Record<string, string> = {};
  for (const other of all) {
    if (other.kind !== activity.kind || other.id === activity.id) continue;
    if (!overlaps(activityRange(other), range)) continue;
    for (const sid of other.studentIds) out[sid] ??= other.title;
  }
  return out;
}

/** „2.–27. 11. 2026“, „1. 12. 2026 – 25. 1. 2027“ — vždy s rokem, nikdy dvakrát. */
export function formatDateRangeWithYear(from: string, to: string): string {
  const text = formatDateRange(from, to);
  return /\d{4}/.test(text) ? text : `${text} ${to.slice(0, 4)}`;
}
