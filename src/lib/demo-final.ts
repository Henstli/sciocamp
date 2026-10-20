// Ukázkový režim: skončené kurzy, ateliéry a expedice mají závěrečné hodnocení
// a jsou uzavřené (pevně „náhodně“ podle id), aby bylo co ukázat ve Statistikách.

import { isGradable, type Closure, type FinalReview } from "./final-reviews";
import { hasEnded } from "./periods";
import type { Activity } from "./types";

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

const GOOD = [
  "Pracoval(a) soustavně a výsledek stojí za to.",
  "Skvělá aktivita v hodinách, díky za nápady.",
  "Splněno se vším všudy, závěrečná práce byla výborná.",
  "Pěkný posun během celého období.",
];
const BAD = [
  "Chybí závěrečný projekt a většina úkolů.",
  "Málo účasti a nedokončená práce. Domluvme se, jak to dohnat.",
];

export function demoFinal(activities: Activity[], todayIso: string): { reviews: FinalReview[]; closures: Closure[] } {
  const reviews: FinalReview[] = [];
  const closures: Closure[] = [];
  for (const a of activities) {
    if (!isGradable(a.kind) || !hasEnded(a, todayIso) || a.studentIds.length === 0) continue;
    const end = a.endsOn ?? a.period?.endsOn ?? todayIso;
    const at = `${end}T15:00:00Z`;
    for (const sid of a.studentIds) {
      const ok = rnd(`${a.id}:${sid}`) < 0.88;
      const list = ok ? GOOD : BAD;
      reviews.push({
        activityId: a.id,
        studentId: sid,
        result: ok ? "splneno" : "nesplneno",
        feedback: list[Math.floor(rnd(`${a.id}:${sid}:f`) * list.length)],
        reviewedBy: a.teacherId,
        reviewedAt: at,
      });
    }
    closures.push({ activityId: a.id, closedAt: at, closedBy: a.teacherId });
  }
  return { reviews, closures };
}
