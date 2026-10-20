// Rozdělení na expedici: pokoje, vaření, úklid… (vyučující vypíše možnosti
// s kapacitou, studenti se přihlásí). Typy a pomocné funkce pro UI i server.

export type SignupOption = {
  id: string;
  label: string;
  /** Den („rrrr-mm-dd“) u služeb po dnech, jinak null */
  day: string | null;
  /** null = bez omezení */
  capacity: number | null;
  /** Kolik lidí je přihlášených (i když jména nejsou vidět) */
  taken: number;
  /** Přihlášení, které smí uživatel vidět */
  studentIds: string[];
};

export type SignupBoard = {
  id: string;
  title: string;
  description: string;
  maxPerStudent: number;
  /** Má se přihlásit každý (ukáže, kdo chybí) */
  required: boolean;
  /** Studenti vidí, kdo je kde */
  showNames: boolean;
  locked: boolean;
  /** Do kdy se dá přihlašovat (ISO), null = bez termínu */
  closesAt: string | null;
  options: SignupOption[];
};

/** Mohou se studenti teď přihlašovat? */
export function boardOpen(b: Pick<SignupBoard, "locked" | "closesAt">, now: number): boolean {
  return !b.locked && (!b.closesAt || new Date(b.closesAt).getTime() > now);
}

/** Šablony pro rychlé založení. */
export const SIGNUP_TEMPLATES = {
  pokoje: {
    title: "Pokoje",
    description: "Vyber si pokoj. Když je plný, zkus jiný.",
    maxPerStudent: 1,
    required: true,
    showNames: true,
    perDay: false,
    options: [
      { label: "Pokoj 1", capacity: 4 },
      { label: "Pokoj 2", capacity: 4 },
      { label: "Pokoj 3", capacity: 4 },
    ],
  },
  vareni: {
    title: "Vaření",
    description: "Každý den vaří jedna skupinka. Přihlas se na jeden den.",
    maxPerStudent: 1,
    required: true,
    showNames: true,
    perDay: true,
    options: [{ label: "Večeře", capacity: 3 }],
  },
  uklid: {
    title: "Úklid",
    description: "Rozdělte si úklid společných prostor.",
    maxPerStudent: 1,
    required: true,
    showNames: true,
    perDay: true,
    options: [
      { label: "Kuchyně", capacity: 2 },
      { label: "Společenská místnost", capacity: 2 },
    ],
  },
  vlastni: {
    title: "",
    description: "",
    maxPerStudent: 1,
    required: false,
    showNames: true,
    perDay: false,
    options: [{ label: "", capacity: null as number | null }],
  },
} as const;
export type SignupTemplate = keyof typeof SIGNUP_TEMPLATES;

/** Dny výjezdu („rrrr-mm-dd“) od–do včetně. */
export function tripDays(from: string | null, to: string | null): string[] {
  if (!from || !to) return [];
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end && out.length < 31) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const DAY_NAMES = ["ne", "po", "út", "st", "čt", "pá", "so"];

/** „út 27. 10.“ */
export function formatDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}
