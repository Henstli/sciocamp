// Splnění kurzů, ateliérů a expedic (ze závěrečného hodnocení) pro Statistiky.

import { isGradable, type Closure, type FinalReview } from "./final-reviews";
import { activityRange } from "./periods";
import type { Activity, ActivityKind } from "./types";

export type CompletionState = "splneno" | "nesplneno" | "ceka" | "probiha";

export type CompletionRow = {
  activity: Activity;
  studentId: string;
  state: CompletionState;
  review: FinalReview | null;
  /** Hodnocení už vidí student (třída je uzavřená) */
  published: boolean;
};

export type CompletionSummary = {
  total: number;
  splneno: number;
  nesplneno: number;
  /** Skončilo, ale chybí hodnocení */
  ceka: number;
  probiha: number;
  /** Podíl splněných z ohodnocených (null = nic ohodnoceného) */
  rate: number | null;
};

export const COMPLETION_KINDS: { kind: ActivityKind; label: string; plural: string }[] = [
  { kind: "kurz", label: "Kurzy", plural: "kurzů" },
  { kind: "atelier", label: "Ateliéry", plural: "ateliérů" },
  { kind: "expedice", label: "Expedice", plural: "expedic" },
];

export const COMPLETION_TEXT: Record<CompletionState, string> = {
  splneno: "Splněno",
  nesplneno: "Nesplněno",
  ceka: "Čeká na hodnocení",
  probiha: "Probíhá",
};
export const COMPLETION_CHIP: Record<CompletionState, string> = {
  splneno: "chip-ok",
  nesplneno: "chip-late",
  ceka: "chip-wait",
  probiha: "chip-info",
};

/**
 * Každý zápis studenta do kurzu/ateliéru/expedice, která v období běžela
 * (skončila po `fromIso` a začala do dneška).
 */
export function completionRows(
  activities: Activity[],
  reviews: FinalReview[],
  closures: Closure[],
  fromIso: string,
  todayIso: string,
  students?: Set<string>,
): CompletionRow[] {
  const rev = new Map(reviews.map((r) => [`${r.activityId}:${r.studentId}`, r]));
  const closed = new Set(closures.map((c) => c.activityId));
  const out: CompletionRow[] = [];
  for (const a of activities) {
    if (!isGradable(a.kind) || a.published === false) continue;
    const { from, to } = activityRange(a);
    if ((to && to < fromIso) || (from && from > todayIso)) continue;
    const ended = !!to && to < todayIso;
    for (const sid of a.studentIds) {
      if (students && !students.has(sid)) continue;
      const r = rev.get(`${a.id}:${sid}`) ?? null;
      out.push({
        activity: a,
        studentId: sid,
        state: r ? r.result : ended ? "ceka" : "probiha",
        review: r,
        published: closed.has(a.id),
      });
    }
  }
  return out;
}

export function completionSummary(rows: CompletionRow[]): CompletionSummary {
  const s = { total: rows.length, splneno: 0, nesplneno: 0, ceka: 0, probiha: 0 };
  for (const r of rows) s[r.state]++;
  const graded = s.splneno + s.nesplneno;
  return { ...s, rate: graded ? s.splneno / graded : null };
}

/** Skončené třídy, které ještě nejsou uzavřené (hodnocení studenti nevidí). */
export function awaitingClosure(rows: CompletionRow[], todayIso: string) {
  const by = new Map<string, { activity: Activity; total: number; graded: number }>();
  for (const r of rows) {
    if (r.published) continue;
    const to = activityRange(r.activity).to;
    if (!to || to >= todayIso) continue;
    const e = by.get(r.activity.id) ?? { activity: r.activity, total: 0, graded: 0 };
    e.total++;
    if (r.review) e.graded++;
    by.set(r.activity.id, e);
  }
  return [...by.values()].sort((a, b) => (activityRange(a.activity).to ?? "").localeCompare(activityRange(b.activity).to ?? ""));
}
