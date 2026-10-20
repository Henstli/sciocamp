// Wrap — roční shrnutí „Tvůj rok v Campu“. Typy, typy v Campu (archetypy),
// sestavení snímků a karty k uložení. Data počítá databáze (wrap_data).

import { BADGE_BY_KEY, isBadgeKey, type EarnedBadge } from "./badges";
import { plural } from "./format";

export type WrapState = {
  /** Kdy se wrap spustí pro všechny (ISO) */
  launchAt: string;
  /** Do kdy je k dispozici v profilu (ISO) */
  until: string;
  /** Právě běží (pro všechny, nebo zkouška na mně) */
  active: boolean;
  /** Zkouška spuštění jen na mně (admin) */
  trial: boolean;
  /** Už jsem ho letos viděl(a) — sám se znovu neotevře */
  seen: boolean;
  /** Rok začátku školního roku (2026 = 2026/27) */
  season: number;
};

export type WrapTypeKey =
  | "vypravnik" | "tvurce" | "snilek" | "hlas" | "zvedavec" | "pracant" | "partak" | "tabornik"
  | "pruvodce" | "mistr" | "konzultant" | "mentor" | "hybatel" | "architekt" | "spojka" | "opora";

export type WrapPerson = { id: string; name: string; count: number };

type Common = {
  messages: number;
  gifs: number;
  topEmoji: string | null;
  people: WrapPerson[];
  badges: EarnedBadge[];
  type: { key: WrapTypeKey; value: number; beat: number };
};

export type WrapStudent = Common & {
  handed: number;
  onTime: number;
  withDue: number;
  /** 1 = pondělí … 7 = neděle */
  topWeekday: number | null;
  points: number;
  fullPoints: number;
  passed: number;
  reviewed: number;
  courses: number;
  ateliers: number;
  teachers: number;
  milestones: number;
  expeditions: string[];
  expeditionDays: number;
  votes: number;
  wishVotes: number;
  wishes: number;
  wishesFulfilled: string[];
  proposals: number;
  polls: number;
  consultations: number;
  consultationTop: string | null;
};

export type WrapStaff = Common & {
  courses: number;
  ateliers: number;
  expeditions: number;
  students: number;
  tasks: number;
  materials: number;
  topClass: string | null;
  reviews: number;
  reviewDays: number | null;
  feedback: number;
  livelyTitle: string | null;
  livelyChat: number;
  livelyPosts: number;
  posts: number;
  consultations: number;
  wishesFulfilled: string[];
  proposalsResolved: number;
  votes: number;
  polls: number;
};

export type WrapSchool = {
  handed: number;
  reviews: number;
  messages: number;
  expeditions: number;
  approved: number;
  wishes: number;
  topAtelier: string | null;
};

type Base = { name: string; userId: string; season: number; school: WrapSchool; demo?: boolean };
export type WrapData = (Base & { kind: "student"; mine: WrapStudent }) | (Base & { kind: "staff"; mine: WrapStaff });

/** Jak se wrap přehrává: můj, nebo ukázka (admin ve Správě). */
export type WrapMode = "mine" | "student" | "staff";

// ---------------------------------------------------------------------------
// Typy v Campu
// ---------------------------------------------------------------------------

export type WrapTypeDef = {
  name: string;
  /** Delší popis na snímku s typem */
  desc: string;
  /** Jedna věta na kartě (3. osoba, bez rodu) */
  short: string;
  /** Ikona (cesta SVG, viewBox 24) */
  icon: string;
  /** Hlavní barva (ikona na bílém) */
  color: string;
  /** Přechod karty */
  card: [string, string, string];
  /** Proč zrovna tenhle typ */
  why: (v: number) => string;
};

const n = (v: number) => Math.round(v).toLocaleString("cs-CZ");

export const WRAP_TYPES: Record<WrapTypeKey, WrapTypeDef> = {
  vypravnik: {
    name: "Výpravník",
    desc: "Nejvíc tě táhne ven: expedice, výpravy a nová místa. Kde se něco děje, tam jsi.",
    short: "Kde se něco děje, tam nechybí. Letos hlavně v lese, na horách a u kotle.",
    icon: "M3 20 10 7l4 7 2-3 5 9z",
    color: "#0F6B5F",
    card: ["#0F6B5F", "#17704A", "#3B6FE0"],
    why: (v) => `Byl(a) jsi na ${n(v)} ${plural(v, "expedici", "expedicích", "expedicích")}.`,
  },
  tvurce: {
    name: "Tvůrce",
    desc: "Ateliéry jsou tvoje hřiště. Něco vymyslíš, rozpracuješ a dotáhneš do konce.",
    short: "Vymyslí, rozpracuje a dotáhne do konce.",
    icon: "M7.5 3.5a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM13 13h8v8h-8zM17 3l4 7h-8z",
    color: "#5B4BC4",
    card: ["#5B4BC4", "#3B2F99", "#3B6FE0"],
    why: () => "Nejvíc ateliérů a hotových milníků.",
  },
  snilek: {
    name: "Snílek",
    desc: "Máš nápady, jak Camp vylepšit, a nebojíš se je napsat. Přání a návrhy jsou tvoje parketa.",
    short: "Má nápady, jak Camp vylepšit, a nebojí se je říct nahlas.",
    icon: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
    color: "#5B4BC4",
    card: ["#5B4BC4", "#8C4FC4", "#E0A43C"],
    why: (v) => `${n(v)} ${plural(v, "přání nebo návrh", "přání a návrhy", "přání a návrhů")} od tebe.`,
  },
  hlas: {
    name: "Hlas školy",
    desc: "Když se o něčem rozhoduje, nechybíš. Hlasuješ v návrzích, přáních i anketách.",
    short: "Když se o něčem rozhoduje, nechybí.",
    icon: "M4 20h16M6 4h12v12H6zM9 10l2 2 4-4",
    color: "#1F4FB8",
    card: ["#1F4FB8", "#3B6FE0", "#5B4BC4"],
    why: (v) => `${n(v)} ${plural(v, "hlas", "hlasy", "hlasů")} v návrzích, přáních a anketách.`,
  },
  zvedavec: {
    name: "Zvídavec",
    desc: "Ptáš se, chodíš na konzultace a chceš věcem přijít na kloub.",
    short: "Ptá se, chodí na konzultace a jde věcem na kloub.",
    icon: "M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12zM10 9.5a2 2 0 1 1 2.5 2c-.4.2-.5.5-.5 1V13M12 16h.01",
    color: "#17704A",
    card: ["#17704A", "#0F6B5F", "#1F4FB8"],
    why: (v) => `${n(v)} ${plural(v, "konzultace", "konzultace", "konzultací")} v pátek ráno.`,
  },
  pracant: {
    name: "Pracant",
    desc: "Úkoly tě nerozhodí. Odevzdáváš, dotahuješ a máš hotovo dřív než ostatní.",
    short: "Odevzdává, dotahuje a má hotovo.",
    icon: "M9 3.5h6v3H9zM7 5H5.5v15.5h13V5H17M8.5 13l2.5 2.5 4.5-5",
    color: "#2F5FCC",
    card: ["#2F5FCC", "#1A3A8F", "#17704A"],
    why: (v) => `${n(v)} ${plural(v, "odevzdaný úkol", "odevzdané úkoly", "odevzdaných úkolů")}.`,
  },
  partak: {
    name: "Parťák",
    desc: "Bez tebe by chaty mlčely. Píšeš, odpovídáš, držíš partu pohromadě.",
    short: "Píše, odpovídá a drží partu pohromadě.",
    icon: "M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14a6.5 6.5 0 0 1 3.5 6",
    color: "#8A5300",
    card: ["#8A5300", "#C0711A", "#5B4BC4"],
    why: (v) => `${n(v)} ${plural(v, "zpráva", "zprávy", "zpráv")} v chatech.`,
  },
  tabornik: {
    name: "Táborník",
    desc: "Byl(a) jsi u všeho po trochu: kurzy, úkoly, chaty i hlasování. Camp bez tebe nebyl celý.",
    short: "Od všeho trochu: kurzy, úkoly, chaty i hlasování.",
    icon: "M3 20 12 4l9 16zM9.5 20 12 15.5 14.5 20",
    color: "#3B6FE0",
    card: ["#3B6FE0", "#2F5FCC", "#5B4BC4"],
    why: () => "Trochu od všeho, a to se taky počítá.",
  },
  pruvodce: {
    name: "Průvodce",
    desc: "Bereš studenty ven. Expedice s tebou jsou to, na co se pak vzpomíná.",
    short: "Bere studenty ven, na expedice, na které se vzpomíná.",
    icon: "M3 20 10 7l4 7 2-3 5 9zM10 7V3l4 1.5L10 6",
    color: "#0F6B5F",
    card: ["#0F6B5F", "#17704A", "#E0A43C"],
    why: (v) => `Vedl(a) jsi ${n(v)} ${plural(v, "expedici", "expedice", "expedic")}.`,
  },
  mistr: {
    name: "Mistr dílny",
    desc: "Ateliéry pod tvým vedením mají šťávu. Studenti si od tebe odnášejí hotové věci.",
    short: "Vede ateliéry, ze kterých se odchází s hotovou věcí.",
    icon: "M14 4l6 6-8 8H6v-6zM4 20l2-2",
    color: "#5B4BC4",
    card: ["#5B4BC4", "#3B2F99", "#E0A43C"],
    why: (v) => `Vedl(a) jsi ${n(v)} ${plural(v, "ateliér", "ateliéry", "ateliérů")}.`,
  },
  konzultant: {
    name: "Konzultant",
    desc: "Na páteční konzultace k tobě studenti chodí rádi a vracejí se.",
    short: "Páteční konzultace, na které se studenti vracejí.",
    icon: "M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12zM8.5 11h.01M12 11h.01M15.5 11h.01",
    color: "#17704A",
    card: ["#17704A", "#0F6B5F", "#3B6FE0"],
    why: (v) => `${n(v)} ${plural(v, "konzultace", "konzultace", "konzultací")} se studenty.`,
  },
  mentor: {
    name: "Mentor",
    desc: "Hodnotíš rychle a slovem, ne jen body. Studenti od tebe vědí, kde jsou.",
    short: "Hodnotí rychle a slovem, ne jen body.",
    icon: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4",
    color: "#9A5B00",
    card: ["#9A5B00", "#C0711A", "#5B4BC4"],
    why: (v) => `${n(v)} ${plural(v, "ohodnocená práce", "ohodnocené práce", "ohodnocených prací")}.`,
  },
  hybatel: {
    name: "Hybatel",
    desc: "Návrhy, přání, hlasování — když se Camp mění, máš v tom prsty.",
    short: "Když se Camp mění, má v tom prsty.",
    icon: "M5 21V4M5 4h11l-2 4 2 4H5",
    color: "#1F4FB8",
    card: ["#1F4FB8", "#3B6FE0", "#17704A"],
    why: () => "Nejvíc návrhů, přání a hlasování mezi vyučujícími.",
  },
  architekt: {
    name: "Architekt",
    desc: "Úkoly a materiály od tebe tvoří kostru kurzů. Promyšlené, srozumitelné, včas.",
    short: "Úkoly a materiály, které drží kurzy pohromadě.",
    icon: "M4 20h16M6 20V9l6-5 6 5v11M10 20v-6h4v6",
    color: "#2F5FCC",
    card: ["#2F5FCC", "#1A3A8F", "#5B4BC4"],
    why: (v) => `${n(v)} ${plural(v, "zadaný úkol nebo materiál", "zadané úkoly a materiály", "zadaných úkolů a materiálů")}.`,
  },
  spojka: {
    name: "Spojka",
    desc: "Píšeš, odpovídáš a sdílíš. Díky tobě se ve třídách ví, co se děje.",
    short: "Píše a sdílí, ve třídách se díky tomu ví, co se děje.",
    icon: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
    color: "#5B4BC4",
    card: ["#5B4BC4", "#3B6FE0", "#0F6B5F"],
    why: (v) => `${n(v)} ${plural(v, "zpráva a příspěvek", "zprávy a příspěvky", "zpráv a příspěvků")}.`,
  },
  opora: {
    name: "Opora Campu",
    desc: "Učíš, hodnotíš, odpovídáš, pomáháš. Bez lidí jako ty by Camp nefungoval.",
    short: "Učí, hodnotí, pomáhá. Camp na tom stojí.",
    icon: "M12 21s-7-4.4-9.3-9A5 5 0 0 1 12 6.5 5 5 0 0 1 21.3 12C19 16.6 12 21 12 21z",
    color: "#9A5B00",
    card: ["#9A5B00", "#C0711A", "#3B6FE0"],
    why: () => "Trochu od všeho, a to se taky počítá.",
  },
};

export const isWrapType = (k: string): k is WrapTypeKey => k in WRAP_TYPES;

/** „Víc než 9 z 10 studentů Campu.“ */
export function beatText(beat: number, staff: boolean): string | null {
  if (beat >= 0.999) return staff ? "Nikdo z vyučujících tě letos nepředběhl." : "Nikdo v Campu tě letos nepředběhl.";
  const tens = Math.floor(beat * 10);
  if (tens < 5) return null;
  return `Víc než ${tens} z 10 ${staff ? "vyučujících" : "studentů"} Campu.`;
}

// ---------------------------------------------------------------------------
// Převod dat z databáze
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) || 0 : 0);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function common(m: Raw): Common {
  const t = (m.type ?? {}) as Raw;
  const key = typeof t.key === "string" && isWrapType(t.key) ? t.key : "tabornik";
  return {
    messages: num(m.messages),
    gifs: num(m.gifs),
    topEmoji: str(m.top_emoji),
    people: (Array.isArray(m.people) ? (m.people as Raw[]) : []).map((p) => ({ id: String(p.id), name: String(p.name ?? ""), count: num(p.count) })),
    badges: (Array.isArray(m.badges) ? (m.badges as Raw[]) : [])
      .filter((b) => typeof b.key === "string" && isBadgeKey(b.key))
      .map((b) => ({ key: b.key as EarnedBadge["key"], tier: num(b.tier) })),
    type: { key, value: num(t.value), beat: num(t.beat) },
  };
}

/** Výstup funkce wrap_data → WrapData. */
export function parseWrap(raw: Raw, userId: string): WrapData {
  const m = (raw.mine ?? {}) as Raw;
  const s = (raw.school ?? {}) as Raw;
  const school: WrapSchool = {
    handed: num(s.handed),
    reviews: num(s.reviews),
    messages: num(s.messages),
    expeditions: num(s.expeditions),
    approved: num(s.approved),
    wishes: num(s.wishes),
    topAtelier: str(s.top_atelier),
  };
  const base = { name: String(raw.name ?? ""), userId, season: num(raw.season), school };
  if (raw.role === "student") {
    return {
      ...base,
      kind: "student",
      mine: {
        ...common(m),
        handed: num(m.handed),
        onTime: num(m.on_time),
        withDue: num(m.with_due),
        topWeekday: m.top_weekday == null ? null : num(m.top_weekday),
        points: num(m.points),
        fullPoints: num(m.full_points),
        passed: num(m.passed),
        reviewed: num(m.reviewed),
        courses: num(m.courses),
        ateliers: num(m.ateliers),
        teachers: num(m.teachers),
        milestones: num(m.milestones),
        expeditions: strs(m.expeditions),
        expeditionDays: num(m.expedition_days),
        votes: num(m.votes),
        wishVotes: num(m.wish_votes),
        wishes: num(m.wishes),
        wishesFulfilled: strs(m.wishes_fulfilled),
        proposals: num(m.proposals),
        polls: num(m.polls),
        consultations: num(m.consultations),
        consultationTop: str(m.consultation_top),
      },
    };
  }
  return {
    ...base,
    kind: "staff",
    mine: {
      ...common(m),
      courses: num(m.courses),
      ateliers: num(m.ateliers),
      expeditions: num(m.expeditions),
      students: num(m.students),
      tasks: num(m.tasks),
      materials: num(m.materials),
      topClass: str(m.top_class),
      reviews: num(m.reviews),
      reviewDays: m.review_days == null ? null : num(m.review_days),
      feedback: num(m.feedback),
      livelyTitle: str(m.lively_title),
      livelyChat: num(m.lively_chat),
      livelyPosts: num(m.lively_posts),
      posts: num(m.posts),
      consultations: num(m.consultations),
      wishesFulfilled: strs(m.wishes_fulfilled),
      proposalsResolved: num(m.proposals_resolved),
      votes: num(m.votes),
      polls: num(m.polls),
    },
  };
}

// ---------------------------------------------------------------------------
// Termíny (stejně jako v databázi)
// ---------------------------------------------------------------------------

/** Začátek školního roku (rok), do kterého patří datum „rrrr-mm-dd“. */
export function seasonOf(isoDate: string): number {
  const y = Number(isoDate.slice(0, 4));
  return Number(isoDate.slice(5, 7)) >= 9 ? y : y - 1;
}

/** „2026/27“ */
export const seasonLabel = (season: number) => `${season}/${String((season + 1) % 100).padStart(2, "0")}`;

/** Výchozí spuštění: 20. 6. v 8:00 pražského času (místní zápis). */
export const defaultLaunchLocal = (season: number) => `${season + 1}-06-20T08:00`;

export const WRAP_DAYS = 14;

// ---------------------------------------------------------------------------
// Snímky
// ---------------------------------------------------------------------------

export type WrapSlide = {
  key: string;
  kicker: string;
  title: string;
  big?: string;
  unit?: string;
  lines?: { value: string; label: string }[];
  people?: WrapPerson[];
  badges?: EarnedBadge[];
  type?: { def: WrapTypeDef; reason: string | null };
  note?: string;
  summary?: boolean;
  /** Pozadí: přechod a dvě barvy světel */
  bg: [string, string];
  glow: [string, string];
};

const BG: Record<string, Pick<WrapSlide, "bg" | "glow">> = {
  intro: { bg: ["#3B6FE0", "#1F4FB8"], glow: ["#6D95EE", "#5B4BC4"] },
  introStaff: { bg: ["#9A5B00", "#5C3700"], glow: ["#E0A43C", "#3B6FE0"] },
  blue: { bg: ["#2F5FCC", "#1A3A8F"], glow: ["#6D95EE", "#C9D8FA"] },
  green: { bg: ["#17704A", "#0D4A30"], glow: ["#2FA594", "#E3F4EC"] },
  violet: { bg: ["#5B4BC4", "#3B2F99"], glow: ["#8C7EE6", "#3B6FE0"] },
  teal: { bg: ["#0F6B5F", "#0A4840"], glow: ["#2FA594", "#E0A43C"] },
  amber: { bg: ["#8A5300", "#5C3700"], glow: ["#E0A43C", "#FBE38A"] },
  mix: { bg: ["#3B6FE0", "#5B4BC4"], glow: ["#8C7EE6", "#6D95EE"] },
  night: { bg: ["#262B52", "#0F1226"], glow: ["#3B6FE0", "#5B4BC4"] },
  gold: { bg: ["#111A33", "#262B52"], glow: ["#E0B84A", "#3B6FE0"] },
  school: { bg: ["#1F4FB8", "#111A33"], glow: ["#6D95EE", "#8C7EE6"] },
};

const WEEKDAY_IN = ["v pondělí", "v úterý", "ve středu", "ve čtvrtek", "v pátek", "v sobotu", "v neděli"];

const line = (value: number | string, label: string) => ({ value: typeof value === "number" ? n(value) : value, label });

function typeSlide(data: WrapData): WrapSlide {
  const def = WRAP_TYPES[data.mine.type.key];
  const staff = data.kind === "staff";
  const generic = data.mine.type.key === "tabornik" || data.mine.type.key === "opora";
  const reason = generic ? def.why(0) : [def.why(data.mine.type.value), beatText(data.mine.type.beat, staff)].filter(Boolean).join(" ");
  return {
    key: "typ",
    kicker: "Tvůj typ v Campu",
    title: "Jsi…",
    type: { def, reason },
    bg: [def.card[0], def.card[2]],
    glow: [def.card[1], "#FBE38A"],
  };
}

function badgesSlide(badges: EarnedBadge[]): WrapSlide | null {
  const list = badges.filter((b) => BADGE_BY_KEY.has(b.key));
  if (list.length === 0) return null;
  return {
    key: "odznaky",
    kicker: "Odznaky",
    title: `Letos jsi získal(a)\n${list.length} ${plural(list.length, "odznak", "odznaky", "odznaků")}`,
    badges: list.slice(0, 6),
    note: list.length > 6 ? `A dalších ${list.length - 6} najdeš ve svém profilu.` : undefined,
    ...BG.gold,
  };
}

function peopleSlide(people: WrapPerson[]): WrapSlide | null {
  if (people.length === 0) return null;
  return { key: "lide", kicker: "Zprávy", title: "Nejvíc sis psal(a) s", people, ...BG.night };
}

/** Snímky wrapu v pořadí; bez dat se snímek vynechá. */
export function buildSlides(data: WrapData): WrapSlide[] {
  const out: (WrapSlide | null)[] = [];
  const season = seasonLabel(data.season);
  const s = data.school;
  if (data.kind === "student") {
    const m = data.mine;
    out.push({ key: "uvod", kicker: `Školní rok ${season}`, title: "Tohle byl\ntvůj rok\nv Campu.", note: "Klepni vpravo pro další, vlevo zpět. Podržením pozastavíš.", ...BG.intro });
    if (m.handed > 0) {
      const pct = m.withDue > 0 ? Math.round((m.onTime / m.withDue) * 100) : null;
      const bits = [pct !== null ? `${pct} % z nich včas.` : null, m.topWeekday ? `Nejčastěji odevzdáváš ${WEEKDAY_IN[m.topWeekday - 1]}.` : null];
      out.push({ key: "ukoly", kicker: "Úkoly", title: "Odevzdal(a) jsi", big: n(m.handed), unit: plural(m.handed, "úkol", "úkoly", "úkolů"), note: bits.filter(Boolean).join(" ") || undefined, ...BG.blue });
    }
    if (m.passed > 0) {
      const lines = [
        m.fullPoints > 0 ? line(`${n(m.fullPoints)}×`, "plný počet bodů") : null,
        m.reviewed > 0 ? line(`${Math.round((m.passed / m.reviewed) * 100)} %`, "úkolů splněno") : null,
      ].filter((x) => x !== null);
      out.push(
        m.points > 0
          ? { key: "body", kicker: "Hodnocení", title: "Nasbíral(a) jsi", big: n(m.points), unit: plural(m.points, "bod", "body", "bodů"), lines, ...BG.green }
          : { key: "body", kicker: "Hodnocení", title: "Splnil(a) jsi", big: n(m.passed), unit: plural(m.passed, "úkol", "úkoly", "úkolů"), lines, ...BG.green },
      );
    }
    if (m.courses + m.ateliers > 0) {
      out.push({
        key: "kurzy",
        kicker: "Kurzy a ateliéry",
        title: "Tvůj rozvrh byl pestrý",
        lines: [
          m.courses ? line(m.courses, plural(m.courses, "kurz", "kurzy", "kurzů")) : null,
          m.ateliers ? line(m.ateliers, plural(m.ateliers, "ateliér", "ateliéry", "ateliérů")) : null,
          m.teachers ? line(m.teachers, plural(m.teachers, "vyučující", "různí vyučující", "různých vyučujících")) : null,
          m.milestones ? line(m.milestones, plural(m.milestones, "hotový milník projektu", "hotové milníky projektů", "hotových milníků projektů")) : null,
        ].filter((x) => x !== null),
        ...BG.violet,
      });
    }
    if (m.expeditions.length > 0) {
      const k = m.expeditions.length;
      out.push({
        key: "expedice",
        kicker: "Expedice",
        title: "Na expedicích jsi strávil(a)",
        big: n(m.expeditionDays),
        unit: plural(m.expeditionDays, "den", "dny", "dní"),
        lines: [
          s.expeditions > 0 ? line(`${k} z ${s.expeditions}`, plural(s.expeditions, "expedice, která letos byla", "expedic, které letos byly", "expedic, které letos byly")) : line(k, plural(k, "expedice", "expedice", "expedic")),
          ...m.expeditions.slice(0, 2).map((t, i) => line(`${i + 1}.`, t)),
        ],
        note: k > 2 ? `A ${k - 2} ${plural(k - 2, "další", "další", "dalších")}.` : undefined,
        ...BG.teal,
      });
    }
    const community = [
      m.votes ? line(m.votes, plural(m.votes, "hlas v návrzích", "hlasy v návrzích", "hlasů v návrzích")) : null,
      m.wishVotes ? line(m.wishVotes, plural(m.wishVotes, "hlas pro přání", "hlasy pro přání", "hlasů pro přání")) : null,
      m.wishesFulfilled.length ? line(m.wishesFulfilled.length, `${plural(m.wishesFulfilled.length, "tvoje přání se splnilo", "tvoje přání se splnila", "tvých přání se splnilo")}: ${m.wishesFulfilled.slice(0, 2).join(", ")}`) : null,
      m.proposals ? line(m.proposals, plural(m.proposals, "tvůj návrh", "tvoje návrhy", "tvých návrhů")) : null,
      m.polls ? line(m.polls, plural(m.polls, "založená anketa", "založené ankety", "založených anket")) : null,
    ].filter((x) => x !== null);
    if (community.length) out.push({ key: "komunita", kicker: "Komunita", title: "Měl(a) jsi slovo", lines: community.slice(0, 4), ...BG.amber });
    if (m.messages > 0) {
      // Emoji nikdy na konci věty s tečkou — vypadá to jako překlep.
      const gifs = m.gifs ? `${n(m.gifs)} ${plural(m.gifs, "GIF", "GIFy", "GIFů")}` : null;
      const note = m.topEmoji
        ? gifs
          ? `Poslal(a) jsi ${gifs} a nejčastěji reaguješ ${m.topEmoji}`
          : `Nejčastěji reaguješ ${m.topEmoji}`
        : gifs
          ? `A k tomu ${gifs}.`
          : undefined;
      out.push({ key: "zpravy", kicker: "Zprávy", title: "Poslal(a) jsi", big: n(m.messages), unit: plural(m.messages, "zprávu", "zprávy", "zpráv"), note, ...BG.mix });
    }
    out.push(peopleSlide(m.people));
    if (m.consultations > 0) {
      out.push({ key: "konzultace", kicker: "Konzultace", title: "Na konzultaci jsi byl(a)", big: `${n(m.consultations)}×`, unit: "v pátek ráno", note: m.consultationTop ? `Nejčastěji u: ${m.consultationTop}.` : undefined, ...BG.green });
    }
  } else {
    const m = data.mine;
    out.push({ key: "uvod", kicker: `Školní rok ${season}`, title: "Takhle vypadal\ntvůj rok\nv Campu.", note: "Díky za všechno, co jsi pro studenty udělal(a). Pojďme se podívat zpátky.", ...BG.introStaff });
    if (m.courses + m.ateliers + m.expeditions > 0) {
      out.push({
        key: "vyuka",
        kicker: "Výuka",
        title: "Vedl(a) jsi",
        lines: [
          m.courses ? line(m.courses, plural(m.courses, "kurz", "kurzy", "kurzů")) : null,
          m.ateliers ? line(m.ateliers, plural(m.ateliers, "ateliér", "ateliéry", "ateliérů")) : null,
          m.expeditions ? line(m.expeditions, plural(m.expeditions, "expedici", "expedice", "expedic")) : null,
          m.students ? line(m.students, plural(m.students, "student", "různí studenti", "různých studentů")) : null,
        ].filter((x) => x !== null),
        ...BG.blue,
      });
    }
    if (m.tasks + m.materials > 0) {
      const bits = [m.materials ? `A k nim ${n(m.materials)} ${plural(m.materials, "materiál", "materiály", "materiálů")}.` : null, m.topClass ? `Nejvíc práce šlo do: ${m.topClass}.` : null];
      out.push(
        m.tasks > 0
          ? { key: "zadani", kicker: "Zadání", title: "Zadal(a) jsi", big: n(m.tasks), unit: plural(m.tasks, "úkol", "úkoly", "úkolů"), note: bits.filter(Boolean).join(" ") || undefined, ...BG.violet }
          : { key: "zadani", kicker: "Zadání", title: "Připravil(a) jsi", big: n(m.materials), unit: plural(m.materials, "materiál", "materiály", "materiálů"), note: bits[1] ?? undefined, ...BG.violet },
      );
    }
    if (m.reviews > 0) {
      out.push({
        key: "hodnoceni",
        kicker: "Hodnocení",
        title: "Ohodnotil(a) jsi",
        big: n(m.reviews),
        unit: plural(m.reviews, "práci", "práce", "prací"),
        lines: [
          m.reviewDays !== null ? line(`${m.reviewDays.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} ${m.reviewDays === 1 ? "den" : m.reviewDays > 1 && m.reviewDays < 5 && Number.isInteger(m.reviewDays) ? "dny" : "dne"}`, "průměrně od odevzdání po hodnocení") : null,
          m.feedback ? line(m.feedback, plural(m.feedback, "slovní hodnocení", "slovní hodnocení", "slovních hodnocení")) : null,
        ].filter((x) => x !== null),
        ...BG.green,
      });
    }
    if (m.livelyTitle && m.livelyChat + m.livelyPosts > 0) {
      out.push(
        m.livelyChat > 0
          ? { key: "trida", kicker: "Nejživější třída", title: m.livelyTitle, big: n(m.livelyChat), unit: plural(m.livelyChat, "zpráva v chatu třídy", "zprávy v chatu třídy", "zpráv v chatu třídy"), note: m.livelyPosts ? `Plus ${n(m.livelyPosts)} ${plural(m.livelyPosts, "příspěvek", "příspěvky", "příspěvků")} na nástěnce.` : undefined, ...BG.mix }
          : { key: "trida", kicker: "Nejživější třída", title: m.livelyTitle, big: n(m.livelyPosts), unit: plural(m.livelyPosts, "příspěvek na nástěnce", "příspěvky na nástěnce", "příspěvků na nástěnce"), ...BG.mix },
      );
    }
    const talk = [
      m.messages ? line(m.messages, plural(m.messages, "zpráva", "zprávy", "zpráv")) : null,
      m.consultations ? line(m.consultations, plural(m.consultations, "konzultace v pátek ráno", "konzultace v pátek ráno", "konzultací v pátek ráno")) : null,
      m.posts ? line(m.posts, plural(m.posts, "příspěvek na nástěnkách", "příspěvky na nástěnkách", "příspěvků na nástěnkách")) : null,
    ].filter((x) => x !== null);
    if (talk.length) out.push({ key: "komunikace", kicker: "Komunikace", title: "Byl(a) jsi na příjmu", lines: talk, ...BG.teal });
    out.push(peopleSlide(m.people));
    const community = [
      m.wishesFulfilled.length ? line(m.wishesFulfilled.length, `${plural(m.wishesFulfilled.length, "vypsané přání studentů", "vypsaná přání studentů", "vypsaných přání studentů")}: ${m.wishesFulfilled.slice(0, 2).join(", ")}`) : null,
      m.proposalsResolved ? line(m.proposalsResolved, plural(m.proposalsResolved, "uzavřený návrh", "uzavřené návrhy", "uzavřených návrhů")) : null,
      m.votes ? line(m.votes, plural(m.votes, "hlas v návrzích", "hlasy v návrzích", "hlasů v návrzích")) : null,
      m.polls ? line(m.polls, plural(m.polls, "založená anketa", "založené ankety", "založených anket")) : null,
    ].filter((x) => x !== null);
    if (community.length) out.push({ key: "komunita", kicker: "Komunita", title: "Pomohl(a) jsi škole měnit se", lines: community, ...BG.amber });
  }

  out.push(badgesSlide(data.mine.badges));
  out.push(typeSlide(data));
  const schoolLines = [
    s.handed ? line(s.handed, plural(s.handed, "odevzdaný úkol", "odevzdané úkoly", "odevzdaných úkolů")) : null,
    data.kind === "staff" && s.reviews ? line(s.reviews, plural(s.reviews, "ohodnocená práce", "ohodnocené práce", "ohodnocených prací")) : null,
    s.messages ? line(s.messages, plural(s.messages, "zpráva", "zprávy", "zpráv")) : null,
    s.expeditions ? line(s.expeditions, plural(s.expeditions, "expedice", "expedice", "expedic")) : null,
    s.approved ? line(s.approved, plural(s.approved, "schválený návrh", "schválené návrhy", "schválených návrhů")) : null,
    s.wishes ? line(s.wishes, plural(s.wishes, "splněné přání", "splněná přání", "splněných přání")) : null,
  ].filter((x) => x !== null);
  if (schoolLines.length) {
    out.push({
      key: "skola",
      kicker: "Škola v číslech",
      title: "A celý Camp za rok",
      lines: schoolLines.slice(0, 4),
      note: s.topAtelier ? `Nejoblíbenější ateliér: ${s.topAtelier}.` : undefined,
      ...BG.school,
    });
  }
  const def = WRAP_TYPES[data.mine.type.key];
  out.push({ key: "karta", kicker: "Tvůj rok", title: "Tvoje karta roku", summary: true, bg: ["#111A33", def.card[0]], glow: [def.card[1], def.card[2]] });
  return out.filter((x): x is WrapSlide => x !== null);
}

// ---------------------------------------------------------------------------
// Karta roku (poslední snímek a obrázek k uložení)
// ---------------------------------------------------------------------------

export type WrapCard = {
  firstName: string;
  fullName: string;
  initials: string;
  season: string;
  type: WrapTypeDef;
  stats: { value: string; label: string }[];
};

export function wrapCard(data: WrapData): WrapCard {
  const parts = data.name.trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  const type = WRAP_TYPES[data.mine.type.key];
  const stat = (v: number, one: string, few: string, many: string) => (v > 0 ? { value: n(v), label: plural(v, one, few, many), v } : null);
  type S = { value: string; label: string; v: number } | null;
  let list: S[];
  if (data.kind === "student") {
    const m = data.mine;
    const byType: Partial<Record<WrapTypeKey, S>> = {
      vypravnik: stat(m.expeditionDays, "den na expedici", "dny na expedicích", "dní na expedicích"),
      tvurce: stat(m.ateliers, "ateliér", "ateliéry", "ateliérů"),
      snilek: stat(m.wishes + m.proposals, "přání a návrh", "přání a návrhy", "přání a návrhů"),
      hlas: stat(m.votes + m.wishVotes, "hlas", "hlasy", "hlasů"),
      zvedavec: stat(m.consultations, "konzultace", "konzultace", "konzultací"),
      pracant: stat(m.handed, "úkol", "úkoly", "úkolů"),
      partak: stat(m.messages, "zpráva", "zprávy", "zpráv"),
    };
    list = [
      byType[m.type.key] ?? null,
      stat(m.handed, "úkol", "úkoly", "úkolů"),
      stat(m.points, "bod", "body", "bodů"),
      stat(m.expeditionDays, "den na expedici", "dny na expedicích", "dní na expedicích"),
      stat(m.badges.length, "odznak", "odznaky", "odznaků"),
      stat(m.messages, "zpráva", "zprávy", "zpráv"),
    ];
  } else {
    const m = data.mine;
    const byType: Partial<Record<WrapTypeKey, S>> = {
      pruvodce: stat(m.expeditions, "expedice", "expedice", "expedic"),
      mistr: stat(m.ateliers, "ateliér", "ateliéry", "ateliérů"),
      konzultant: stat(m.consultations, "konzultace", "konzultace", "konzultací"),
      mentor: stat(m.reviews, "ohodnocená práce", "ohodnocené práce", "ohodnocených prací"),
      architekt: stat(m.tasks + m.materials, "úkol a materiál", "úkoly a materiály", "úkolů a materiálů"),
      spojka: stat(m.messages + m.posts, "zpráva", "zprávy", "zpráv"),
    };
    list = [
      byType[m.type.key] ?? null,
      stat(m.reviews, "ohodnocená práce", "ohodnocené práce", "ohodnocených prací"),
      stat(m.students, "student", "studenti", "studentů"),
      stat(m.consultations, "konzultace", "konzultace", "konzultací"),
      stat(m.tasks, "úkol", "úkoly", "úkolů"),
      stat(m.badges.length, "odznak", "odznaky", "odznaků"),
    ];
  }
  const seen = new Set<string>();
  const stats = list
    .filter((x): x is NonNullable<S> => x !== null)
    .filter((x) => (seen.has(x.label) ? false : (seen.add(x.label), true)))
    .slice(0, 3)
    .map(({ value, label }) => ({ value, label }));
  return { firstName: parts[0] ?? "", fullName: data.name, initials, season: seasonLabel(data.season), type, stats };
}
