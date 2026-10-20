// Závěrečné hodnocení: načítání (vyučující a admin vidí celou školu,
// student jen svoje a jen u uzavřených tříd — hlídá RLS).

import "server-only";
import { cache } from "react";
import { isSupabase } from "./config";
import { listActivities } from "./data";
import { demoFinal } from "./demo-final";
import type { Closure, FinalResult, FinalReview } from "./final-reviews";
import { createClient } from "./supabase/server";
import { pragueNow, toIso } from "./time";

type ReviewRow = { activity_id: string; student_id: string; result: FinalResult; feedback: string; reviewed_by: string; reviewed_at: string };
type ClosureRow = { activity_id: string; closed_at: string; closed_by: string };

async function finalDataUncached(): Promise<{ reviews: FinalReview[]; closures: Closure[] }> {
  const activities = await listActivities();
  if (!isSupabase) return demoFinal(activities, toIso(pragueNow()));
  const slug = new Map(activities.map((a) => [a.dbId, a.id]));
  const sb = await createClient();
  const [r, c] = await Promise.all([
    sb.from("final_reviews").select("activity_id, student_id, result, feedback, reviewed_by, reviewed_at"),
    sb.from("activity_closures").select("activity_id, closed_at, closed_by"),
  ]);
  // Dokud není nasazená migrace, tabulky chybí — stránky pak hodnocení jen neukážou.
  if (r.error || c.error) return { reviews: [], closures: [] };
  return {
    reviews: (r.data as ReviewRow[]).flatMap((x) => {
      const id = slug.get(x.activity_id);
      return id
        ? [{ activityId: id, studentId: x.student_id, result: x.result, feedback: x.feedback, reviewedBy: x.reviewed_by, reviewedAt: x.reviewed_at }]
        : [];
    }),
    closures: (c.data as ClosureRow[]).flatMap((x) => {
      const id = slug.get(x.activity_id);
      return id ? [{ activityId: id, closedAt: x.closed_at, closedBy: x.closed_by }] : [];
    }),
  };
}

export const finalData = cache(finalDataUncached);

/** Hodnocení a uzavření jedné třídy */
export async function finalForActivity(activityId: string) {
  const { reviews, closures } = await finalData();
  return {
    reviews: new Map(reviews.filter((r) => r.activityId === activityId).map((r) => [r.studentId, r])),
    closure: closures.find((c) => c.activityId === activityId) ?? null,
  };
}
