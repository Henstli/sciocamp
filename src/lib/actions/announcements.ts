"use server";

import { refresh } from "next/cache";
import { isAudience } from "../announcements";
import { requireAdmin, requireUser } from "../auth";
import { isSupabase } from "../config";
import { createClient } from "../supabase/server";
import { pragueLocalToIso } from "../time";

const DEMO = "Ukázkový režim: změny se neukládají.";

export type AnnouncementState = { error?: string; info?: string; fieldErrors?: Record<string, string>; ok?: boolean };

/** Admin zveřejní oznámení na Domově (a pošle notifikaci). */
export async function createAnnouncement(_prev: AnnouncementState, formData: FormData): Promise<AnnouncementState> {
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const link = String(formData.get("link") ?? "").trim();
  const audience = formData.get("audience");
  const endsRaw = String(formData.get("endsAt") ?? "").trim();
  const fieldErrors: Record<string, string> = {};
  if (!title) fieldErrors.title = "Napiš nadpis.";
  else if (title.length > 120) fieldErrors.title = "Nadpis je moc dlouhý (nejvýš 120 znaků).";
  if (body.length > 1500) fieldErrors.body = "Text je moc dlouhý (nejvýš 1500 znaků).";
  let linkUrl: string | null = null;
  if (link) {
    const withProto = /^https?:\/\//i.test(link) ? link : `https://${link}`;
    try {
      linkUrl = new URL(withProto).toString();
    } catch {
      fieldErrors.link = "Odkaz nevypadá jako webová adresa.";
    }
  }
  let endsAt: string | null = null;
  if (endsRaw === "neplatne") fieldErrors.endsAt = "Datum nebo čas není vyplněný správně.";
  else if (endsRaw) {
    endsAt = pragueLocalToIso(endsRaw);
    if (!endsAt) fieldErrors.endsAt = "Datum nebo čas není vyplněný správně.";
    else if (new Date(endsAt).getTime() <= Date.now()) fieldErrors.endsAt = "Konec musí být v budoucnu.";
  }
  if (!isAudience(audience)) fieldErrors.audience = "Vyber, pro koho oznámení je.";
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await sb.from("announcements").insert({ title, body, link_url: linkUrl, audience, ends_at: endsAt });
  if (error) return { error: "Oznámení se nepodařilo zveřejnit." };
  refresh();
  return { ok: true, info: "Oznámení je na Domově." };
}

/** Admin oznámení hned ukončí (zmizí z Domova, v seznamu zůstane). */
export async function endAnnouncement(id: string): Promise<AnnouncementState> {
  await requireAdmin();
  if (!isSupabase) return { error: DEMO };
  const sb = await createClient();
  const { error } = await sb.from("announcements").update({ ends_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "Oznámení se nepodařilo ukončit." };
  refresh();
  return {};
}

export async function deleteAnnouncement(id: string): Promise<AnnouncementState> {
  await requireAdmin();
  if (!isSupabase) return { error: DEMO };
  const sb = await createClient();
  const { error } = await sb.from("announcements").delete().eq("id", id);
  if (error) return { error: "Oznámení se nepodařilo smazat." };
  refresh();
  return {};
}

/** Uživatel si oznámení skryje („Rozumím“). */
export async function dismissAnnouncement(id: string): Promise<AnnouncementState> {
  await requireUser();
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await sb.from("announcement_dismissals").insert({ announcement_id: id });
  if (error && error.code !== "23505") return { error: "Oznámení se nepodařilo skrýt." };
  refresh();
  return {};
}
