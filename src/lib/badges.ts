// Odznaky: katalog (názvy, popisy, ikony, úrovně) a výpočty pro zobrazení.
// Hranice úrovní musí odpovídat tabulce badge_levels v databázi.

export type BadgeCategory = "start" | "uceni" | "dobro" | "komunita" | "tajne";
export type BadgeKey =
  | "vitej"
  | "prvni-krok"
  | "zakladatel"
  | "pracant"
  | "vcas"
  | "spolehlivy"
  | "druhy-dech"
  | "plny-pocet"
  | "tymovy-hrac"
  | "vypravnik"
  | "tvurce"
  | "zvedavec"
  | "hlas-skoly"
  | "iniciator"
  | "menim-skolu"
  | "snilek"
  | "zvidavy"
  | "anketar"
  | "na-vlne";

export type BadgeDef = {
  key: BadgeKey;
  name: string;
  /** Za co (u úrovní s „{n}“ = hranice další úrovně) */
  desc: string;
  category: BadgeCategory;
  /** Ikona: cesta v mřížce 24×24 */
  icon: string;
  /** Hranice úrovní (jedna = odznak bez úrovní) */
  levels: [number] | [number, number, number];
  /** Vzácný: zlatý okraj s leskem */
  rare?: boolean;
  /** Tajný: do získání jen „???“ a nápověda */
  secret?: string;
  /** Jednotka u postupu („úkolů“) */
  unit?: string;
};

export const BADGE_CATEGORIES: { key: BadgeCategory; title: string; hint: string }[] = [
  { key: "start", title: "Start", hint: "první kroky v aplikaci" },
  { key: "uceni", title: "Učení", hint: "úkoly a hodnocení" },
  { key: "dobro", title: "Dobrodružství", hint: "expedice, ateliéry a kurzy" },
  { key: "komunita", title: "Komunita", hint: "návrhy, přání a konzultace" },
  { key: "tajne", title: "Tajné", hint: "odhalí se až po získání" },
];

export const BADGES: BadgeDef[] = [
  { key: "vitej", name: "Vítej v Campu", desc: "Vyplněný profil: fotka a O mně", category: "start", icon: "M3 20 12 4l9 16zM9.5 20 12 15.5 14.5 20", levels: [1] },
  { key: "prvni-krok", name: "První krok", desc: "První odevzdaný úkol", category: "start", icon: "M5 19 19 5M9 5h10v10", levels: [1] },
  { key: "zakladatel", name: "Zakladatel", desc: "Byl(a) jsi v aplikaci v jejím prvním roce", category: "start", icon: "M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z", levels: [1], rare: true },
  { key: "pracant", name: "Pracant", desc: "Odevzdané úkoly", category: "uceni", icon: "M9 3.5h6v3H9zM7 5H5.5v15.5h13V5H17M8.5 13l2.5 2.5 4.5-5", levels: [15, 100, 300], unit: "úkolů" },
  { key: "vcas", name: "Včas", desc: "Úkoly odevzdané před termínem", category: "uceni", icon: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7.5V12l3 2", levels: [15, 75, 200], unit: "úkolů" },
  { key: "spolehlivy", name: "Spolehlivý", desc: "Celé pololetí splněné všechny úkoly ze zapsaných aktivit", category: "uceni", icon: "M12 3 4.5 6v6c0 4.5 3.2 7.6 7.5 9 4.3-1.4 7.5-4.5 7.5-9V6zM8.5 12l2.5 2.5 4.5-5", levels: [1] },
  { key: "druhy-dech", name: "Druhý dech", desc: "Vrácené úkoly doplněné na „splněno“", category: "uceni", icon: "M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5", levels: [5], unit: "úkolů" },
  { key: "plny-pocet", name: "Plný počet", desc: "Úkoly za plný počet bodů", category: "uceni", icon: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z", levels: [5, 40, 120], unit: "úkolů" },
  { key: "tymovy-hrac", name: "Týmový hráč", desc: "Splněné týmové úkoly", category: "uceni", icon: "M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6", levels: [5], unit: "úkolů" },
  { key: "vypravnik", name: "Výpravník", desc: "Absolvované expedice", category: "dobro", icon: "M3 20 10 7l4 7 2-3 5 9z", levels: [1, 10, 25], unit: "expedic" },
  { key: "tvurce", name: "Tvůrce", desc: "Dokončené ateliéry", category: "dobro", icon: "M7.5 3.5a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM13 13h8v8h-8zM17 3l4 7h-8z", levels: [2, 7, 14], unit: "ateliérů" },
  { key: "zvedavec", name: "Zvědavec", desc: "Kurzy u různých vyučujících", category: "dobro", icon: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM15.5 8.5l-2 5-5 2 2-5z", levels: [6], unit: "vyučujících" },
  { key: "hlas-skoly", name: "Hlas školy", desc: "Hlasování v návrzích", category: "komunita", icon: "M4 20h16M6 4h12v12H6zM9 10l2 2 4-4", levels: [10, 50, 150], unit: "hlasů" },
  { key: "iniciator", name: "Iniciátor", desc: "Vlastní návrh dosáhl potřebného počtu hlasů", category: "komunita", icon: "M9 18h6M10 21h4M12 3a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 3z", levels: [1] },
  { key: "menim-skolu", name: "Měním školu", desc: "Vlastní návrh byl schválený", category: "komunita", icon: "M5 21V4M5 4h11l-2 4 2 4H5", levels: [1], rare: true },
  { key: "snilek", name: "Snílek", desc: "Vlastní přání se proměnilo ve skutečný ateliér nebo expedici", category: "komunita", icon: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z", levels: [1] },
  { key: "zvidavy", name: "Zvídavý", desc: "Absolvované konzultace", category: "komunita", icon: "M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12zM10 9.5a2 2 0 1 1 2.5 2c-.5.2-.5.5-.5 1M12 15.5v.01", levels: [5], unit: "konzultací" },
  { key: "anketar", name: "Anketář", desc: "Tvoje anketa, ve které hlasovalo aspoň 20 lidí", category: "tajne", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2", levels: [20], secret: "Stačí se správně zeptat…" },
  { key: "na-vlne", name: "Na vlně", desc: "4 týdny v řadě všechno odevzdáno včas", category: "tajne", icon: "M2 12c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1.5M2 17c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1.5", levels: [4], secret: "Vydrž v jednom tempu." },
];

export const BADGE_BY_KEY = new Map(BADGES.map((b) => [b.key, b]));
export const isBadgeKey = (k: string): k is BadgeKey => BADGE_BY_KEY.has(k as BadgeKey);

/** Získaný odznak (úroveň 1–3). */
export type EarnedBadge = { key: BadgeKey; tier: number; earnedAt?: string | null };
/** Odznak ve sbírce: hodnota postupu a úroveň (0 = nezískaný). */
export type BadgeProgress = { key: BadgeKey; value: number; tier: number; earnedAt: string | null };

export const TIER_ROMAN = ["", "I", "II", "III"];

/** Kov okraje: bronz / stříbro / zlato; vzácné a odznaky bez úrovní zvlášť. */
export type BadgeMetal = "bronz" | "stribro" | "zlato" | "vzacny" | "jeden" | "zadny";

export function badgeMetal(def: BadgeDef, tier: number): BadgeMetal {
  if (tier <= 0) return "zadny";
  if (def.rare) return "vzacny";
  if (def.levels.length === 1) return "jeden";
  return (["bronz", "stribro", "zlato"] as const)[Math.min(tier, 3) - 1];
}

export const METAL_LABEL: Record<BadgeMetal, string> = {
  bronz: "Bronz",
  stribro: "Stříbro",
  zlato: "Zlato",
  vzacny: "Vzácný",
  jeden: "Odznak",
  zadny: "Nezískaný",
};

/** „Pracant II“ (u odznaků s úrovněmi), jinak jen název. */
export function badgeTitle(def: BadgeDef, tier: number): string {
  return def.levels.length > 1 && tier > 0 ? `${def.name} ${TIER_ROMAN[tier]}` : def.name;
}

/** Štítek úrovně: „Stříbro · II“, „Vzácný“, „Odznak“. */
export function tierLabel(def: BadgeDef, tier: number): string {
  const metal = badgeMetal(def, tier);
  if (def.levels.length > 1 && tier > 0) return `${METAL_LABEL[metal]} · ${TIER_ROMAN[tier]}`;
  return METAL_LABEL[metal];
}

/** Popis s hranicemi úrovní: „Odevzdané úkoly 15 / 100 / 300“. */
export function badgeDescription(def: BadgeDef): string {
  if (def.levels.length > 1) return `${def.desc} ${def.levels.join(" / ")}`;
  if (def.levels[0] > 1 && def.unit) return `${def.desc} (${def.levels[0]})`;
  return def.desc;
}

/** Další cíl a postup k němu (null = vše získáno). */
export function nextGoal(def: BadgeDef, p: { value: number; tier: number }): { target: number; pct: number } | null {
  const target = def.levels[p.tier];
  if (target === undefined) return null;
  return { target, pct: Math.max(0, Math.min(100, Math.round((p.value / target) * 100))) };
}

/** Text animace: co člověk dokázal. */
export function earnedText(def: BadgeDef, tier: number): string {
  if (def.levels.length > 1) {
    const n = def.levels[tier - 1];
    const next = def.levels[tier];
    return `${def.desc}: ${n} ${def.unit ?? ""}`.trim() + (next ? `. Další úroveň za ${next}.` : ". Máš nejvyšší úroveň!");
  }
  return def.desc + ".";
}
