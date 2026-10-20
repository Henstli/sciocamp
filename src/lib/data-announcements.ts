// Oznámení na Domově. Naostro přes RLS (vidí jen cílová skupina), v ukázkovém režimu pevná data.

import "server-only";
import { cache } from "react";
import { type Announcement, announcementActive } from "./announcements";
import { isSupabase } from "./config";
import { canTeach } from "./roles";
import { createClient } from "./supabase/server";
import { nowMs } from "./time";
import type { User } from "./types";

const DEMO: Announcement[] = [
  {
    id: "o-demo",
    title: "V pátek 23. 10. odpadá výuka",
    body: "Kvůli celoškolnímu setkání učitelů se v pátek nekoná výuka ani konzultace. Úkoly s termínem v pátek můžete odevzdat do pondělí.",
    linkUrl: null,
    audience: "vsichni",
    endsAt: "2026-10-23T21:59:00Z",
    createdBy: "u-pavel",
    createdAt: "2026-10-19T07:00:00Z",
  },
];

type Row = {
  id: string;
  title: string;
  body: string;
  link_url: string | null;
  audience: Announcement["audience"];
  ends_at: string | null;
  created_by: string;
  created_at: string;
};

const toAnnouncement = (r: Row): Announcement => ({
  id: r.id,
  title: r.title,
  body: r.body,
  linkUrl: r.link_url,
  audience: r.audience,
  endsAt: r.ends_at,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

/** Všechna oznámení, která uživatel smí vidět (admin všechna), nejnovější první. */
async function listAnnouncementsUncached(): Promise<Announcement[]> {
  if (!isSupabase) return DEMO;
  const sb = await createClient();
  const { data, error } = await sb
    .from("announcements")
    .select("id, title, body, link_url, audience, ends_at, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  return (data as Row[]).map(toAnnouncement);
}
export const listAnnouncements = cache(listAnnouncementsUncached);

/** Platná oznámení pro Domov, která si uživatel neskryl. */
export async function homeAnnouncements(user: User): Promise<Announcement[]> {
  const now = nowMs();
  const all = (await listAnnouncements()).filter((a) => announcementActive(a, now));
  // Admin vidí všechna, ale na Domově jen ta, která jsou pro jeho skupinu.
  const mine = all.filter((a) => a.audience === "vsichni" || (a.audience === "vyucujici") === canTeach(user.role));
  if (!isSupabase || mine.length === 0) return mine;
  const sb = await createClient();
  const { data } = await sb.from("announcement_dismissals").select("announcement_id").in("announcement_id", mine.map((a) => a.id));
  const hidden = new Set((data ?? []).map((d) => d.announcement_id as string));
  return mine.filter((a) => !hidden.has(a.id));
}
