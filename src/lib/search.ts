// Vyhledávání na Domově: položky a řazení výsledků (běží v prohlížeči).

export type SearchKind = "activity" | "assignment" | "person" | "proposal" | "wish" | "page";

export type SearchItem = {
  kind: SearchKind;
  title: string;
  /** Druhý řádek (druh, třída, role, stav…) */
  sub: string;
  href: string;
  /** Další slova, podle kterých se položka najde (e-mail, vyučující, téma…) */
  keywords?: string;
  /** Uživatel pro avatar u lidí */
  userId?: string;
  /** Odstín štítku u aktivit (kurz, atelier, ostatni, expedice) */
  tone?: string;
};

export const KIND_LABEL: Record<SearchKind, string> = {
  activity: "Aktivity",
  assignment: "Úkoly a materiály",
  person: "Lidé",
  proposal: "Návrhy",
  wish: "Hlasování",
  page: "Stránky",
};

export const KIND_ORDER: SearchKind[] = ["activity", "assignment", "person", "proposal", "wish", "page"];

/** Malá písmena bez diakritiky: „Šachy“ → „sachy“. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Skóre shody (0 = nic): celý název > začátek > začátek slova > kdekoli > klíčová slova. */
function score(item: SearchItem, words: string[]): number {
  const title = fold(item.title);
  const rest = fold(`${item.sub} ${item.keywords ?? ""}`);
  let total = 0;
  for (const w of words) {
    if (title === w) total += 100;
    else if (title.startsWith(w)) total += 60;
    else if (new RegExp(`(^|[\\s\\-–(„])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title)) total += 40;
    else if (title.includes(w)) total += 20;
    else if (rest.includes(w)) total += 8;
    else return 0; // každé slovo musí někde být
  }
  return total;
}

/** Výsledky podle skupin, v každé nejvýš `perGroup` nejlepších. */
export function searchItems(items: SearchItem[], query: string, perGroup = 5): { kind: SearchKind; items: SearchItem[] }[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored = items
    .map((item) => ({ item, s: score(item, words) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.item.title.localeCompare(b.item.title, "cs"));
  return KIND_ORDER.map((kind) => ({ kind, items: scored.filter((x) => x.item.kind === kind).slice(0, perGroup).map((x) => x.item) })).filter(
    (g) => g.items.length > 0,
  );
}
