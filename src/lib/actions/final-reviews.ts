"use server";

// Závěrečné hodnocení: ukládá vyučující třídy nebo admin. Oprávnění hlídá i databáze (RLS, RPC).

import { refresh } from "next/cache";
import { requireUser } from "../auth";
import { isSupabase } from "../config";
import { getActivity, teachesActivity } from "../data";
import { isGradable, type FinalResult } from "../final-reviews";
import { createClient } from "../supabase/server";

export type FinalActionResult = { error?: string; demo?: boolean };

async function managed(slug: string) {
  const user = await requireUser();
  const activity = await getActivity(slug);
  if (!activity || !teachesActivity(user, activity)) return { error: "Hodnotit může jen vyučující třídy nebo admin." } as const;
  if (!isGradable(activity.kind)) return { error: "Závěrečné hodnocení mají jen kurzy, ateliéry a expedice." } as const;
  return { activity } as const;
}

function dbError(error: { code?: string; message?: string } | null, fallback: string): FinalActionResult {
  if (!error) return {};
  if (error.code === "P0001" && error.message) return { error: error.message };
  return { error: fallback };
}

/** Uloží hodnocení jednoho nebo víc studentů (stejné hodnocení všem — např. „zbylým splněno“). */
export async function saveFinalReviews(
  slug: string,
  items: { studentId: string; result: FinalResult; feedback: string }[],
): Promise<FinalActionResult> {
  const m = await managed(slug);
  if ("error" in m) return { error: m.error };
  if (items.length === 0) return {};
  for (const i of items) {
    if (i.result !== "splneno" && i.result !== "nesplneno") return { error: "Vyber splněno, nebo nesplněno." };
    if (i.feedback.length > 4000) return { error: "Slovní hodnocení je moc dlouhé (nejvýš 4000 znaků)." };
    if (!m.activity.studentIds.includes(i.studentId)) return { error: "Student už ve třídě není." };
  }
  if (!isSupabase) return { demo: true };
  const sb = await createClient();
  const { error } = await sb.from("final_reviews").upsert(
    items.map((i) => ({ activity_id: m.activity.dbId, student_id: i.studentId, result: i.result, feedback: i.feedback.trim() })),
    { onConflict: "activity_id,student_id" },
  );
  if (error) return dbError(error, "Hodnocení se nepodařilo uložit.");
  refresh();
  return {};
}

/** Uzavře třídu a zveřejní hodnocení studentům (s oznámením). */
export async function closeActivity(slug: string): Promise<FinalActionResult> {
  const m = await managed(slug);
  if ("error" in m) return { error: m.error };
  if (!isSupabase) return { demo: true };
  const sb = await createClient();
  const { error } = await sb.rpc("close_activity", { activity: m.activity.dbId });
  if (error) return dbError(error, "Třídu se nepodařilo uzavřít.");
  refresh();
  return {};
}

/** Znovu otevře třídu — studenti hodnocení přestanou vidět. */
export async function reopenActivity(slug: string): Promise<FinalActionResult> {
  const m = await managed(slug);
  if ("error" in m) return { error: m.error };
  if (!isSupabase) return { demo: true };
  const sb = await createClient();
  const { error } = await sb.rpc("reopen_activity", { activity: m.activity.dbId });
  if (error) return dbError(error, "Třídu se nepodařilo otevřít.");
  refresh();
  return {};
}
