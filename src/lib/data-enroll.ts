// Zápisy: obsazenost a čekací řady (počty vidí všichni, jména ne).

import "server-only";
import { cache } from "react";
import { isSupabase } from "./config";
import { listActivities } from "./data";
import { DEMO_WAITLIST } from "./demo-data";
import { createClient } from "./supabase/server";
import type { User } from "./types";

export type EnrollInfo = { enrolled: number; waiting: number; myPosition: number | null };

/** Obsazenost aktivit podle slugu. */
async function enrollmentOverviewUncached(user: User): Promise<Map<string, EnrollInfo>> {
  const all = await listActivities();
  const out = new Map<string, EnrollInfo>();
  if (!isSupabase) {
    for (const a of all) {
      const queue = DEMO_WAITLIST[a.id] ?? [];
      const pos = queue.indexOf(user.id);
      out.set(a.id, { enrolled: a.studentIds.length, waiting: queue.length, myPosition: pos >= 0 ? pos + 1 : null });
    }
    return out;
  }
  const sb = await createClient();
  const { data, error } = await sb.rpc("enrollment_overview");
  if (error) throw new Error(`Nepodařilo se načíst obsazenost: ${error.message}`);
  const slugOf = new Map(all.map((a) => [a.dbId, a.id]));
  for (const r of (data ?? []) as { activity_id: string; enrolled: number; waiting: number; my_position: number | null }[]) {
    const slug = slugOf.get(r.activity_id);
    if (slug) out.set(slug, { enrolled: r.enrolled, waiting: r.waiting, myPosition: r.my_position });
  }
  return out;
}

export const enrollmentOverview = cache(enrollmentOverviewUncached);

/** Kdo z učitelů potvrdil, že má kurzy v období hotové (id učitelů). */
async function readyTeachersUncached(periodId: string): Promise<string[]> {
  if (!isSupabase) {
    if (periodId === "obdobi-2") return ["u-jakubcova", "u-pietraszek", "u-pavel", "u-kumstat", "u-kubesova", "u-hankova", "u-lukes"];
    if (periodId === "obdobi-3") return ["u-pietraszek", "u-kumstat"];
    return [];
  }
  const sb = await createClient();
  const { data } = await sb.from("block_ready").select("teacher_id").eq("block_id", periodId);
  return (data ?? []).map((r) => r.teacher_id as string);
}

export const readyTeachers = cache(readyTeachersUncached);

/** Čekací řada aktivity v pořadí (id studentů). Vidí ji vyučující a admin. */
export async function waitlistFor(slug: string, dbId?: string): Promise<string[]> {
  if (!isSupabase) return DEMO_WAITLIST[slug] ?? [];
  if (!dbId) return [];
  const sb = await createClient();
  const { data } = await sb.from("waitlist").select("student_id").eq("activity_id", dbId).order("created_at");
  return (data ?? []).map((r) => r.student_id as string);
}
