"use server";

// Odznaky: přepočet při otevření aplikace, viděná animace, vystavení na profil.

import { refresh } from "next/cache";
import { requireUser } from "../auth";
import { isBadgeKey, type EarnedBadge } from "../badges";
import { isSupabase } from "../config";
import { DEMO_NEW_BADGES } from "../demo-badges";
import { createClient } from "../supabase/server";

/** Přepočítá moje odznaky a vrátí ty, jejichž animaci jsem ještě neviděl(a). */
export async function refreshBadges(): Promise<EarnedBadge[]> {
  const user = await requireUser();
  if (user.role !== "student") return [];
  if (!isSupabase) return user.id === "u-liska" ? DEMO_NEW_BADGES : [];
  const sb = await createClient();
  const { data, error } = await sb.rpc("refresh_my_badges");
  if (error || !data) return [];
  return (data as { badge: string; tier: number; earned_at: string }[])
    .filter((r) => isBadgeKey(r.badge))
    .map((r) => ({ key: r.badge as EarnedBadge["key"], tier: r.tier, earnedAt: r.earned_at }));
}

export async function markBadgesSeen(keys: string[]): Promise<void> {
  await requireUser();
  if (!isSupabase) return;
  const sb = await createClient();
  await sb.rpc("mark_badges_seen", { badges: keys.filter(isBadgeKey) });
}

/** Vystaví až 3 odznaky na kartu profilu (v daném pořadí). */
export async function setShownBadges(keys: string[]): Promise<{ error?: string }> {
  await requireUser();
  const clean = [...new Set(keys.filter(isBadgeKey))];
  if (clean.length > 3) return { error: "Vystavit jde nejvýš 3 odznaky." };
  if (!isSupabase) return {};
  const sb = await createClient();
  const { error } = await sb.rpc("set_shown_badges", { badges: clean });
  if (error) return { error: /[áčéěíňóřšťúůýž]/i.test(error.message) ? error.message : "Odznaky se nepodařilo vystavit." };
  refresh();
  return {};
}

/** Přidá odznak mezi vystavené (z animace). `full` = už jsou vystavené 3. */
export async function showBadge(key: string): Promise<{ error?: string; full?: boolean }> {
  const user = await requireUser();
  if (!isBadgeKey(key)) return { error: "Neznámý odznak." };
  if (!isSupabase) return {};
  const sb = await createClient();
  const { data } = await sb.from("profiles").select("shown_badges").eq("id", user.id).maybeSingle();
  const current = ((data as { shown_badges: string[] } | null)?.shown_badges ?? []).filter((k) => k !== key);
  if (current.length >= 3) return { full: true };
  return setShownBadges([...current, key]);
}
