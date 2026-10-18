"use server";

import { refresh } from "next/cache";
import { requireUser } from "../auth";
import { isSupabase } from "../config";
import { getActivity, teachesActivity } from "../data";
import { normalizeMeetUrl } from "../meet";
import { createClient } from "../supabase/server";

export type MeetState = { error?: string; saved?: string | null; info?: string };

/** Vyučující dané třídy nebo admin vloží, změní či odebere odkaz na Meet. */
export async function updateMeetUrl(_prev: MeetState, formData: FormData): Promise<MeetState> {
  const user = await requireUser();
  const slug = String(formData.get("activity") ?? "");
  const raw = String(formData.get("meetUrl") ?? "");
  const activity = await getActivity(slug);
  if (!activity || !teachesActivity(user, activity)) return { error: "Tuhle třídu upravovat nemůžeš." };

  const url = raw.trim() ? normalizeMeetUrl(raw) : null;
  if (raw.trim() && !url) {
    return { error: "Tohle nevypadá jako odkaz na Google Meet. Vlož celý odkaz, např. https://meet.google.com/abc-defg-hij." };
  }

  if (!isSupabase) return { saved: url, info: "Ukázkový režim: změna se neuloží." };

  const sb = await createClient();
  const { data, error } = await sb.from("activities").update({ meet_url: url }).eq("slug", slug).select("id");
  if (error || !data?.length) return { error: "Odkaz se nepodařilo uložit. Zkus to prosím znovu." };
  refresh();
  return { saved: url, info: url ? "Odkaz na Meet je uložený." : "Odkaz na Meet je odebraný." };
}
