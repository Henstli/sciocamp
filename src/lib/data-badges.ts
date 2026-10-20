// Odznaky na serveru: moje sbírka s postupem a vystavené odznaky člověka.

import "server-only";
import { cache } from "react";
import { BADGES, badgeForRole, isBadgeKey, type BadgeProgress, type EarnedBadge } from "./badges";
import { isSupabase } from "./config";
import { DEMO_BADGE_PROGRESS, DEMO_SHOWN_BADGES } from "./demo-badges";
import { createClient } from "./supabase/server";
import type { User } from "./types";

/** Moje odznaky i s postupem k dalším (jen ty, které moje role může získat). */
async function myBadgeProgressUncached(user: User): Promise<BadgeProgress[]> {
  if (!isSupabase) {
    if (user.id === "u-liska") return DEMO_BADGE_PROGRESS;
    return BADGES.filter((b) => badgeForRole(b, user.role)).map((b) => ({
      key: b.key,
      value: b.key === "mentor" ? 64 : 0,
      tier: b.key === "zakladatel" || b.key === "mentor" ? 1 : 0,
      earnedAt: b.key === "zakladatel" || b.key === "mentor" ? "2026-10-20T08:00:00Z" : null,
    }));
  }
  const sb = await createClient();
  const { data, error } = await sb.rpc("my_badges");
  if (error || !data) return [];
  return (data as { badge: string; value: number; tier: number; earned_at: string | null }[])
    .filter((r) => isBadgeKey(r.badge))
    .map((r) => ({ key: r.badge as BadgeProgress["key"], value: r.value, tier: r.tier, earnedAt: r.earned_at }));
}

/** Vystavené odznaky člověka (nejvýš 3, v jeho pořadí). */
async function shownBadgesUncached(personId: string): Promise<EarnedBadge[]> {
  if (!isSupabase) return DEMO_SHOWN_BADGES[personId] ?? [];
  const sb = await createClient();
  const { data, error } = await sb.rpc("shown_badges_of", { person: personId });
  if (error || !data) return [];
  return (data as { badge: string; tier: number }[])
    .filter((r) => isBadgeKey(r.badge))
    .map((r) => ({ key: r.badge as EarnedBadge["key"], tier: r.tier }));
}

export const myBadgeProgress = cache(myBadgeProgressUncached);
export const shownBadges = cache(shownBadgesUncached);
