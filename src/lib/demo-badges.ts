// Ukázkové odznaky (ukázkový režim bez Supabase).

import type { BadgeProgress, EarnedBadge } from "./badges";

/** Sbírka ukázkového studenta Šimona (u-liska). */
export const DEMO_BADGE_PROGRESS: BadgeProgress[] = [
  { key: "vitej", value: 1, tier: 1, earnedAt: "2026-09-02T08:00:00Z" },
  { key: "prvni-krok", value: 128, tier: 1, earnedAt: "2026-09-09T08:00:00Z" },
  { key: "zakladatel", value: 1, tier: 1, earnedAt: "2026-10-20T08:00:00Z" },
  { key: "pracant", value: 128, tier: 2, earnedAt: "2026-10-10T08:00:00Z" },
  { key: "vcas", value: 52, tier: 1, earnedAt: "2026-09-30T08:00:00Z" },
  { key: "spolehlivy", value: 0, tier: 0, earnedAt: null },
  { key: "druhy-dech", value: 5, tier: 1, earnedAt: "2026-10-14T08:00:00Z" },
  { key: "plny-pocet", value: 3, tier: 0, earnedAt: null },
  { key: "tymovy-hrac", value: 2, tier: 0, earnedAt: null },
  { key: "vypravnik", value: 1, tier: 1, earnedAt: "2026-10-02T08:00:00Z" },
  { key: "tvurce", value: 1, tier: 0, earnedAt: null },
  { key: "zvedavec", value: 4, tier: 0, earnedAt: null },
  { key: "hlas-skoly", value: 12, tier: 1, earnedAt: "2026-10-12T08:00:00Z" },
  { key: "iniciator", value: 0, tier: 0, earnedAt: null },
  { key: "menim-skolu", value: 0, tier: 0, earnedAt: null },
  { key: "snilek", value: 1, tier: 1, earnedAt: "2026-10-01T08:00:00Z" },
  { key: "zvidavy", value: 3, tier: 0, earnedAt: null },
  { key: "anketar", value: 4, tier: 0, earnedAt: null },
  { key: "na-vlne", value: 2, tier: 0, earnedAt: null },
];

/** Vystavené odznaky ukázkových lidí. */
export const DEMO_SHOWN_BADGES: Record<string, EarnedBadge[]> = {
  "u-liska": [
    { key: "zakladatel", tier: 1 },
    { key: "pracant", tier: 2 },
    { key: "vypravnik", tier: 1 },
  ],
  "u-komarek": [
    { key: "vypravnik", tier: 2 },
    { key: "hlas-skoly", tier: 1 },
  ],
};

/** Co se v ukázkovém režimu „právě získalo“ (animace jednou za prohlížeč). */
export const DEMO_NEW_BADGES: EarnedBadge[] = [
  { key: "zakladatel", tier: 1 },
  { key: "pracant", tier: 2 },
];
