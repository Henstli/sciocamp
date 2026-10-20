// Týmy u týmových úkolů a týmový chat. Naostro z databáze (RLS), jinak ukázková data.

import "server-only";
import { cache } from "react";
import { isSupabase } from "./config";
import { assignmentsForActivity } from "./data-assignments";
import { createClient } from "./supabase/server";
import type { Activity, ClassMessage, Team } from "./types";
import { CHAT_META_COLUMNS } from "./chat";
import { chatMetaFor } from "./data-chat";

export const TEAM_BUCKET = "tymy";

/** Ukázkové týmy úkolu „Příprava týmové prezentace“. */
const DEMO_TEAMS: Record<string, Team[]> = {
  "a-tymova": [
    { id: "tym-a", name: "Tým A · Klima", memberIds: ["u-liska", "u-komarek", "u-kolarova", "u-cerny"] },
    { id: "tym-b", name: "Tým B · Technologie", memberIds: ["u-jaukner", "u-novotna", "u-kubicek", "u-maly"] },
    { id: "tym-c", name: "Tým C · Města", memberIds: ["u-svobodova", "u-benes", "u-dvorakova", "u-kral", "u-horakova", "u-vesely"] },
  ],
};

const DEMO_TEAM_CHAT: Record<string, ClassMessage[]> = {
  "tym-a": [
    { id: "t1", authorId: "u-komarek", body: "Rozdělíme si to? Já vezmu úvod a data o klimatu.", createdAt: "2026-10-19T15:02:00Z", file: null },
    { id: "t2", authorId: "u-kolarova", body: "Já udělám grafy.", createdAt: "2026-10-19T15:10:00Z", file: null },
    { id: "t3", authorId: "u-liska", body: "Beru závěr a budu mluvit na konci.", createdAt: "2026-10-19T15:21:00Z", file: null },
  ],
};

async function teamsForAssignmentUncached(assignmentId: string): Promise<Team[]> {
  if (!isSupabase) return DEMO_TEAMS[assignmentId] ?? [];
  const sb = await createClient();
  const { data, error } = await sb
    .from("teams")
    .select("id, name, created_at, team_members(student_id)")
    .eq("assignment_id", assignmentId)
    .order("created_at");
  if (error || !data) return [];
  return data.map((t) => ({
    id: t.id,
    name: t.name,
    memberIds: (t.team_members as { student_id: string }[]).map((m) => m.student_id),
  }));
}

/** Týmy úkolu (se členy). */
export const teamsForAssignment = cache(teamsForAssignmentUncached);

/**
 * Týmy z dřívějších týmových úkolů třídy — vyučující je může převzít
 * do nového úkolu („stejné týmy jako minule“).
 */
export async function teamPresets(activity: Activity, exceptAssignmentId?: string) {
  const tasks = (await assignmentsForActivity(activity)).filter((a) => a.teamWork && a.id !== exceptAssignmentId);
  const out: { assignmentId: string; title: string; teams: Team[] }[] = [];
  for (const t of tasks) {
    const teams = await teamsForAssignment(t.id);
    if (teams.length) out.push({ assignmentId: t.id, title: t.title, teams });
  }
  return out;
}

/** Zprávy týmového chatu (nejstarší nahoře). */
export async function teamChat(teamId: string): Promise<ClassMessage[]> {
  if (!isSupabase) return DEMO_TEAM_CHAT[teamId] ?? [];
  const sb = await createClient();
  const { data, error } = await sb
    .from("team_messages")
    .select(`id, author_id, body, file_path, file_name, file_size, created_at, ${CHAT_META_COLUMNS}`)
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
  const meta = await chatMetaFor("tym", teamId);
  return data.reverse().map((m) => ({
    ...meta(m),
    id: m.id,
    authorId: m.author_id,
    body: m.body,
    createdAt: m.created_at,
    file: m.file_path ? { path: m.file_path, name: m.file_name ?? "soubor", size: m.file_size, url: urls.get(m.file_path) } : null,
  }));
}
