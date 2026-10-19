"use server";

import { refresh } from "next/cache";
import { requireTeacher } from "../auth";
import { isSupabase } from "../config";
import { getActivity, teachesActivity } from "../data";
import { createClient } from "../supabase/server";

export type TeamDraft = { id?: string; name: string; memberIds: string[] };

/**
 * Uloží týmy třídy celé najednou (jak je vyučující poskládal v editoru):
 * smazané týmy zmizí, nové přibudou, členství se nastaví znovu.
 */
export async function saveTeams(activitySlug: string, drafts: TeamDraft[]): Promise<{ error?: string; info?: string }> {
  const user = await requireTeacher();
  const activity = await getActivity(activitySlug);
  if (!activity || !teachesActivity(user, activity)) return { error: "Týmy v téhle třídě upravovat nemůžeš." };

  const teams = drafts
    .map((t) => ({ ...t, name: t.name.trim().slice(0, 80), memberIds: [...new Set(t.memberIds)] }))
    .filter((t) => t.name || t.memberIds.length);
  if (teams.some((t) => !t.name)) return { error: "Každý tým potřebuje název." };
  if (teams.length > 40) return { error: "Týmů je moc (nejvýš 40)." };
  const seen = new Set<string>();
  for (const t of teams) {
    for (const id of t.memberIds) {
      if (!activity.studentIds.includes(id)) return { error: "V týmu je někdo, kdo není ve třídě zapsaný." };
      if (seen.has(id)) return { error: "Student může být jen v jednom týmu." };
      seen.add(id);
    }
  }
  if (!isSupabase || !activity.dbId) return { info: "Ukázkový režim: týmy se neukládají." };

  const sb = await createClient();
  const { data: existing } = await sb.from("teams").select("id").eq("activity_id", activity.dbId);
  const keep = new Set(teams.map((t) => t.id).filter(Boolean));
  const remove = (existing ?? []).map((t) => t.id).filter((id) => !keep.has(id));
  if (remove.length) {
    const { error } = await sb.from("teams").delete().in("id", remove);
    if (error) return { error: "Týmy se nepodařilo uložit." };
  }
  // Členství nejdřív smazat, aby šlo studenty přesouvat mezi týmy.
  const del = await sb.from("team_members").delete().eq("activity_id", activity.dbId);
  if (del.error) return { error: "Týmy se nepodařilo uložit." };

  for (const t of teams) {
    let id = t.id;
    if (id) {
      const { error } = await sb.from("teams").update({ name: t.name }).eq("id", id);
      if (error) return { error: "Týmy se nepodařilo uložit." };
    } else {
      const { data, error } = await sb.from("teams").insert({ activity_id: activity.dbId, name: t.name }).select("id").single();
      if (error || !data) return { error: "Týmy se nepodařilo uložit." };
      id = data.id;
    }
    if (t.memberIds.length) {
      const { error } = await sb.from("team_members").insert(t.memberIds.map((sid) => ({ team_id: id, student_id: sid })));
      if (error) return { error: "Členy týmu se nepodařilo uložit." };
    }
  }
  refresh();
  return { info: "Týmy jsou uložené." };
}
