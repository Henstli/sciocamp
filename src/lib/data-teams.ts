// Týmy ve třídách a týmový chat. Naostro z databáze (RLS), jinak ukázková data.

import "server-only";
import { cache } from "react";
import { isSupabase } from "./config";
import { getClassroom } from "./data";
import { createClient } from "./supabase/server";
import type { Activity, ClassMessage, Team } from "./types";

export const TEAM_BUCKET = "tymy";

/** Ukázkový týmový chat (tým A v ateliéru Prezentační schopnosti). */
const DEMO_TEAM_CHAT: Record<string, ClassMessage[]> = {
  "tym-a": [
    { id: "t1", authorId: "u-komarek", body: "Rozdělíme si to? Já vezmu úvod a data o klimatu.", createdAt: "2026-10-19T15:02:00Z", file: null },
    { id: "t2", authorId: "u-kolarova", body: "Já udělám grafy.", createdAt: "2026-10-19T15:10:00Z", file: null },
    { id: "t3", authorId: "u-liska", body: "Beru závěr a budu mluvit na konci.", createdAt: "2026-10-19T15:21:00Z", file: null },
  ],
};

async function teamsForUncached(activity: Activity): Promise<Team[]> {
  if (!isSupabase || !activity.dbId) return (await getClassroom(activity)).teams;
  const sb = await createClient();
  const { data, error } = await sb
    .from("teams")
    .select("id, name, created_at, team_members(student_id)")
    .eq("activity_id", activity.dbId)
    .order("created_at");
  if (error || !data) return [];
  return data.map((t) => ({
    id: t.id,
    name: t.name,
    memberIds: (t.team_members as { student_id: string }[]).map((m) => m.student_id),
  }));
}

/** Týmy třídy (se členy). */
export const teamsFor = cache(teamsForUncached);

/** Tým studenta ve třídě, nebo null. */
export async function teamOf(activity: Activity, studentId: string): Promise<Team | null> {
  return (await teamsFor(activity)).find((t) => t.memberIds.includes(studentId)) ?? null;
}

/** Zprávy týmového chatu (nejstarší nahoře). */
export async function teamChat(teamId: string): Promise<ClassMessage[]> {
  if (!isSupabase) return DEMO_TEAM_CHAT[teamId] ?? [];
  const sb = await createClient();
  const { data, error } = await sb
    .from("team_messages")
    .select("id, author_id, body, file_path, file_name, file_size, created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(150);
  if (error || !data) return [];
  const paths = data.filter((m) => m.file_path).map((m) => m.file_path!);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await sb.storage.from(TEAM_BUCKET).createSignedUrls(paths, 60 * 60);
    signed?.forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
  }
  return data.reverse().map((m) => ({
    id: m.id,
    authorId: m.author_id,
    body: m.body,
    createdAt: m.created_at,
    file: m.file_path ? { path: m.file_path, name: m.file_name ?? "soubor", size: m.file_size, url: urls.get(m.file_path) } : null,
  }));
}
