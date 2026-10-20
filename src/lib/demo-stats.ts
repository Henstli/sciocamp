// Ukázkový režim: k pár skutečným ukázkovým úkolům doplní vymyšlenou historii
// od začátku školního roku, aby statistiky měly co ukázat. Vždy stejná data
// (pevné „náhodné“ číslo podle id), jen ke čtení.

import { DEMO_ASSIGNMENTS, DEMO_WORK } from "./demo-assignments";
import { schoolYearStart, type StatAssignment, type StatWork } from "./stats";
import { activityRange } from "./periods";
import type { Activity } from "./types";

/** Pevné pseudonáhodné číslo 0–1 z textu */
function rnd(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const DAY = 86_400_000;
const TITLES = ["Domácí úkol", "Krátká reflexe", "Pracovní list", "Mini projekt", "Rozbor", "Shrnutí lekce", "Cvičení", "Esej"];

/** Vymyšlená práce studenta podle jeho „spolehlivosti“ (null = neodevzdal) */
function fakeWork(id: string, sid: string, due: number, max: number | null, now: number): StatWork | null {
  const skill = 0.7 + rnd(`skill:${sid}`) * 0.29;
  const r = (k: string) => rnd(`${id}:${sid}:${k}`);
  const past = due < now;
  if (r("h") >= (past ? skill + 0.12 : skill * 0.5)) return null;
  const late = r("l") < (1 - skill) * 0.9;
  const submittedAt = due + (late ? (1 + Math.floor(r("d") * 3)) * DAY : -Math.floor(r("e") * 3) * DAY - 3_600_000);
  if (submittedAt > now) return null;
  const reviewed = now - submittedAt > 2 * DAY && r("rv") < 0.9;
  const returned = reviewed && r("rt") < (1 - skill) * 0.5;
  const failed = reviewed && !returned && r("f") < (1 - skill) * 0.25;
  const points = reviewed && !returned && max ? Math.round(max * Math.min(1, Math.max(0.3, skill + (r("p") - 0.5) * 0.3))) : null;
  return {
    assignmentId: id,
    studentId: sid,
    status: "odevzdano",
    submittedAt: new Date(submittedAt).toISOString(),
    result: returned ? "vraceno" : !reviewed ? null : failed ? "nesplneno" : "splneno",
    points,
    reviewedAt: reviewed ? new Date(submittedAt + DAY).toISOString() : null,
    returned,
  };
}

export function demoStatsData(activities: Activity[], now: number): { assignments: StatAssignment[]; work: StatWork[] } {
  const assignments: StatAssignment[] = [];
  const work: StatWork[] = [];

  // Skutečné ukázkové úkoly (ty mají i stránku úkolu)
  for (const a of DEMO_ASSIGNMENTS) {
    if (a.kind !== "ukol") continue;
    if (a.publishAt && new Date(a.publishAt).getTime() > now) continue;
    assignments.push({ id: a.id, activityId: a.activityId, title: a.title, dueAt: a.dueAt, maxPoints: a.maxPoints, createdAt: a.createdAt });
  }
  // Studenti bez ukázkové práce dostanou vymyšlenou, ať čísla působí jako ve skutečné škole.
  for (const a of assignments) {
    const act = activities.find((x) => x.id === a.activityId);
    if (!act || !a.dueAt) continue;
    for (const sid of act.studentIds) {
      if (sid === "u-liska" || DEMO_WORK[`${a.id}:${sid}`]) continue; // ukázkový student má svoje
      const w = fakeWork(a.id, sid, new Date(a.dueAt).getTime(), a.maxPoints, now);
      if (w) work.push(w);
    }
  }
  for (const [key, w] of Object.entries(DEMO_WORK)) {
    const [assignmentId, studentId] = key.split(":");
    work.push({
      assignmentId,
      studentId,
      status: w.submission?.status ?? null,
      submittedAt: w.submission?.submittedAt ?? null,
      result: w.review?.result ?? null,
      points: w.review?.points ?? null,
      reviewedAt: w.review?.reviewedAt ?? null,
      returned: w.review?.result === "vraceno",
    });
  }

  // Vymyšlená historie: kurzy a ateliéry mají úkol zhruba každý týden
  const start = new Date(schoolYearStart(now)).getTime() + 7 * DAY;
  for (const act of activities) {
    if ((act.kind !== "kurz" && act.kind !== "atelier") || act.studentIds.length === 0) continue;
    const offset = Math.floor(rnd(act.id) * 4);
    // Jen v době, kdy aktivita běží
    const span = activityRange(act);
    const from = Math.max(start, span.from ? new Date(`${span.from}T00:00:00Z`).getTime() + 5 * DAY : start);
    const to = Math.min(now + 6 * DAY, span.to ? new Date(`${span.to}T23:59:00Z`).getTime() : Infinity);
    for (let n = 0; ; n++) {
      const due = from + (n * 7 + offset) * DAY + 21 * 3_600_000;
      if (due > to) break;
      if (rnd(`${act.id}#${n}`) < 0.25) continue; // ne každý týden je úkol
      const id = `s-${act.id}-${n}`;
      const max = rnd(`${id}#max`) < 0.3 ? null : [10, 15, 20, 30][Math.floor(rnd(`${id}#m`) * 4)];
      assignments.push({
        id,
        activityId: act.id,
        title: `${TITLES[Math.floor(rnd(`${id}#t`) * TITLES.length)]} ${n + 1}`,
        dueAt: new Date(due).toISOString(),
        maxPoints: max,
        createdAt: new Date(due - 7 * DAY).toISOString(),
        synthetic: true,
      });
      for (const sid of act.studentIds) {
        const w = fakeWork(id, sid, due, max, now);
        if (w) work.push(w);
      }
    }
  }
  return { assignments, work };
}
