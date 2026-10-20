"use server";

// Nápověda: odpověď „Pomohl ti návod?“ (jde změnit).

import { requireUser } from "../auth";
import { isSupabase } from "../config";
import { helpGuide } from "../help/guides";
import { createClient } from "../supabase/server";

export async function saveHelpFeedback(slug: string, helpful: boolean): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!helpGuide(slug)) return { error: "Neznámý návod." };
  if (!isSupabase) return {};
  const sb = await createClient();
  const { error } = await sb
    .from("help_feedback")
    .upsert({ user_id: user.id, slug, helpful, updated_at: new Date().toISOString() }, { onConflict: "user_id,slug" });
  return error ? { error: "Odpověď se nepodařilo uložit." } : {};
}
