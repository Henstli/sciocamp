// Nápověda na serveru: moje odpověď „Pomohl ti návod?“ a souhrn pro admina.

import "server-only";
import { isSupabase } from "./config";
import { HELP_GUIDES } from "./help/guides";
import { createClient } from "./supabase/server";
import type { User } from "./types";

export async function myHelpFeedback(user: User, slug: string): Promise<boolean | null> {
  if (!isSupabase) return null;
  const sb = await createClient();
  const { data } = await sb.from("help_feedback").select("helpful").eq("user_id", user.id).eq("slug", slug).maybeSingle();
  return (data as { helpful: boolean } | null)?.helpful ?? null;
}

export type HelpFeedbackRow = { slug: string; title: string; yes: number; no: number };

/** Souhrn odpovědí po návodech (admin). Návody bez odpovědí taky, s nulami. */
export async function helpFeedbackSummary(): Promise<HelpFeedbackRow[]> {
  const counts = new Map<string, { yes: number; no: number }>();
  if (isSupabase) {
    const sb = await createClient();
    const { data } = await sb.from("help_feedback").select("slug, helpful");
    for (const r of (data ?? []) as { slug: string; helpful: boolean }[]) {
      const c = counts.get(r.slug) ?? { yes: 0, no: 0 };
      if (r.helpful) c.yes++;
      else c.no++;
      counts.set(r.slug, c);
    }
  }
  return HELP_GUIDES.map((g) => ({ slug: g.slug, title: g.title, ...(counts.get(g.slug) ?? { yes: 0, no: 0 }) }));
}
