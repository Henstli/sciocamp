// Návrhy a přání (Hlasování): typy, popisky a pomocné funkce sdílené serverem i prohlížečem.

export type ProposalGoal = "shromazdeni" | "schvaleni";
export type ProposalStatus = "open" | "projednano" | "schvaleno" | "zamitnuto" | "stazeno";
export type ProposalCategory = "kurzy" | "ateliery" | "rozvrh" | "online" | "expedice" | "komunita" | "pravidla" | "jine";
export type VoteChoice = "pro" | "jedno" | "proti";

export type Proposal = {
  id: string;
  authorId: string;
  title: string;
  body: string;
  category: ProposalCategory;
  goal: ProposalGoal;
  /** Kolik % školy má být pro — navrhl autor */
  needPercentProposed: number;
  /** Kolik % školy má být pro — potvrdil vyučující (null = čeká na potvrzení) */
  needPercent: number | null;
  status: ProposalStatus;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  proCount: number;
  againstCount: number;
  neutralCount: number;
  reachedAt: string | null;
  createdAt: string;
  commentCount: number;
  /** Jak hlasoval přihlášený (null = nehlasoval) */
  myChoice: VoteChoice | null;
};

export type ProposalComment = { id: string; authorId: string; body: string; createdAt: string };

export const CATEGORY_LABEL: Record<ProposalCategory, string> = {
  kurzy: "Kurzy a výuka",
  ateliery: "Ateliéry",
  rozvrh: "Rozvrh",
  online: "Online prostředí",
  expedice: "Expedice a výjezdy",
  komunita: "Komunita a setkávání",
  pravidla: "Pravidla a hodnocení",
  jine: "Jiné",
};

export const CATEGORY_HINT: Record<ProposalCategory, string> = {
  kurzy: "",
  ateliery: "",
  rozvrh: "",
  online: "Meet, aplikace, nástroje",
  expedice: "",
  komunita: "Srazy, shromáždění, akce",
  pravidla: "",
  jine: "",
};

export const GOAL_LABEL: Record<ProposalGoal, string> = {
  shromazdeni: "Na shromáždění",
  schvaleni: "Ke schválení",
};

export const CHOICE_LABEL: Record<VoteChoice, string> = { pro: "Pro", jedno: "Je mi to jedno", proti: "Proti" };

/** Podíl školy v procentech (zaokrouhleno). */
export function percentOf(count: number, members: number): number {
  return members > 0 ? Math.round((count / members) * 100) : 0;
}

/** Dosáhl návrh prahu? (hlasy pro ≥ práh % celé školy) */
export function proposalReached(p: Pick<Proposal, "proCount" | "needPercent">, members: number): boolean {
  return p.needPercent !== null && p.proCount * 100 >= p.needPercent * members;
}

/** Štítek stavu návrhu: text a třída čipu. */
export function proposalChip(p: Pick<Proposal, "status" | "needPercent" | "proCount" | "goal">, members: number): { label: string; tone: string } {
  switch (p.status) {
    case "projednano":
      return { label: "Projednáno", tone: "chip-primary" };
    case "schvaleno":
      return { label: "Schváleno", tone: "chip-ok" };
    case "zamitnuto":
      return { label: "Zamítnuto", tone: "chip-late" };
    case "stazeno":
      return { label: "Staženo", tone: "chip-info" };
  }
  if (p.needPercent === null) return { label: "Čeká na potvrzení prahu", tone: "chip-info" };
  if (proposalReached(p, members)) {
    return { label: p.goal === "shromazdeni" ? "Půjde na shromáždění" : "Čeká na rozhodnutí", tone: "chip-ok" };
  }
  return { label: "Sbírá hlasy", tone: "chip-wait" };
}

export type WishKind = "atelier" | "expedice" | "kurz";
export type WishStatus = "open" | "vypsano" | "uzavreno";

export type Wish = {
  id: string;
  authorId: string;
  kind: WishKind;
  title: string;
  body: string;
  status: WishStatus;
  /** Vypsaná aktivita (uuid) */
  activityId: string | null;
  note: string | null;
  closedAt: string | null;
  voteCount: number;
  createdAt: string;
  /** Chce to přihlášený? */
  voted: boolean;
};

/** Jak dlouho přání sbírá hlasy; nevypsané se pak smaže. */
export const WISH_DAYS = 14;

/** Kolik celých dní přání ještě zbývá (0 = poslední den). */
export function wishDaysLeft(createdAt: string, nowMs: number): number {
  const end = Date.parse(createdAt) + WISH_DAYS * 86_400_000;
  return Math.max(0, Math.ceil((end - nowMs) / 86_400_000) - 1);
}

/** Schválené i uzavřené přání zůstane vidět ještě týden od rozhodnutí. */
export const WISH_DECIDED_DAYS = 7;

/** Prošlé se nezobrazuje: otevřené po 14 dnech, schválené a uzavřené týden po rozhodnutí. */
export function wishExpired(w: { status: string; createdAt: string; closedAt: string | null }, nowMs: number): boolean {
  if (w.status === "open") return Date.parse(w.createdAt) + WISH_DAYS * 86_400_000 <= nowMs;
  return Date.parse(w.closedAt ?? w.createdAt) + WISH_DECIDED_DAYS * 86_400_000 <= nowMs;
}

export const WISH_KIND_LABEL: Record<WishKind, string> = {
  atelier: "Ateliér",
  expedice: "Expedice",
  kurz: "Téma kurzu",
};
