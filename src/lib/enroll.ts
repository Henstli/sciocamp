// Zápisy: termín zápisu, stav a časové křížení (čisté funkce, server i prohlížeč).
// Pravidla stejná jako v databázi (enroll_window, schedule_clash).

import { activityRange, overlaps } from "./periods";
import { toMinutes } from "./time";
import type { Activity, ActivityKind } from "./types";

/** Druhy, do kterých se studenti zapisují sami. */
export const ENROLL_KINDS: ActivityKind[] = ["kurz", "atelier", "expedice"];

export type EnrollWindow = { opens: string; closes: string };
export type WindowState = "soon" | "open" | "closed";

/** Termín zápisu: kurz z období (po zveřejnění), ateliér a expedice vlastní. */
export function enrollWindow(a: Activity): EnrollWindow | null {
  if (a.published === false) return null;
  if (a.kind === "kurz") {
    const p = a.period;
    if (!p?.publishedAt || !p.enrollOpensAt || !p.enrollClosesAt) return null;
    return { opens: p.enrollOpensAt, closes: p.enrollClosesAt };
  }
  if (!a.round) return null;
  return { opens: a.round.opensAt, closes: a.round.closesAt };
}

export function windowState(w: EnrollWindow, nowMs: number): WindowState {
  if (nowMs < Date.parse(w.opens)) return "soon";
  if (nowMs < Date.parse(w.closes)) return "open";
  return "closed";
}

/** S čím (z mých zápisů) se aktivita časově kříží — název, jinak null. */
export function clashWith(a: Activity, mine: Activity[]): string | null {
  const range = activityRange(a);
  for (const o of mine) {
    if (o.id === a.id || !overlaps(activityRange(o), range)) continue;
    if (o.kind === a.kind && (a.kind === "atelier" || a.kind === "expedice")) return o.title;
    const sameTime = o.slots.some((s1) =>
      a.slots.some(
        (s2) =>
          s1.day === s2.day && toMinutes(s1.start) < toMinutes(s2.end) && toMinutes(s2.start) < toMinutes(s1.end),
      ),
    );
    if (sameTime) return o.title;
  }
  return null;
}

/** Odpočet: „2 dny 3 h“, „3 h 12 min“, „12 min 05 s“. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "0 s";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} ${d === 1 ? "den" : d < 5 ? "dny" : "dní"} ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min ${String(sec).padStart(2, "0")} s`;
}

/** Stejný den a čas v rozvrhu (alespoň jedna hodina se překrývá). */
function sameTime(a: Pick<Activity, "slots">, b: Pick<Activity, "slots">): boolean {
  return a.slots.some((s1) =>
    b.slots.some((s2) => s1.day === s2.day && toMinutes(s1.start) < toMinutes(s2.end) && toMinutes(s2.start) < toMinutes(s1.end)),
  );
}

export type Schedulable = Pick<Activity, "kind" | "slots" | "startsOn" | "endsOn" | "period">;

/**
 * Rozdělí nabídku na skupiny toho, co běží současně (student si z nich vybere
 * jen jedno): kurzy podle dne a času, ateliéry a expedice podle termínu.
 */
export function clusterBySchedule<T extends Schedulable>(items: T[]): T[][] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (!overlaps(activityRange(a), activityRange(b))) continue;
      const together = a.kind === "kurz" || b.kind === "kurz" ? sameTime(a, b) : a.kind === b.kind;
      if (together) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, T[]>();
  items.forEach((it, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(it);
  });
  return [...groups.values()];
}
