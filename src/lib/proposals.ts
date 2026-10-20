// Návrhy a přání (Hlasování): typy, popisky a pomocné funkce sdílené serverem i prohlížečem.

export type ProposalGoal = "shromazdeni" | "schvaleni";
export type ProposalStatus = "open" | "projednano" | "schvaleno" | "zamitnuto" | "stazeno";
export type ProposalCategory = "vyuka" | "rozvrh" | "expedice" | "prostory" | "jine";

export type Proposal = {
  id: string;
  authorId: string;
  title: string;
  body: string;
  category: ProposalCategory;
  goal: ProposalGoal;
  /** Kolik podporovatelů navrhl autor */
  needProposed: number;
  /** Kolik potvrdil vyučující (null = čeká na potvrzení) */
  need: number | null;
  status: ProposalStatus;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  supportCount: number;
  reachedAt: string | null;
  createdAt: string;
  commentCount: number;
  /** Podporuje ho přihlášený? */
  supported: boolean;
};

export type ProposalComment = { id: string; authorId: string; body: string; createdAt: string };

export const CATEGORY_LABEL: Record<ProposalCategory, string> = {
  vyuka: "Výuka a ateliéry",
  rozvrh: "Rozvrh",
  expedice: "Expedice",
  prostory: "Prostory a vybavení",
  jine: "Jiné",
};

export const GOAL_LABEL: Record<ProposalGoal, string> = {
  shromazdeni: "Na shromáždění",
  schvaleni: "Ke schválení",
};

/** Štítek stavu návrhu: text a třída čipu. */
export function proposalChip(p: Pick<Proposal, "status" | "need" | "supportCount" | "goal">): { label: string; tone: string } {
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
  if (p.need === null) return { label: "Čeká na potvrzení počtu", tone: "chip-info" };
  if (p.supportCount >= p.need) {
    return { label: p.goal === "shromazdeni" ? "Půjde na shromáždění" : "Čeká na rozhodnutí", tone: "chip-ok" };
  }
  return { label: "Sbírá podporu", tone: "chip-wait" };
}

/** Počet, ke kterému se měří podpora (potvrzený, jinak navržený). */
export function proposalTarget(p: Pick<Proposal, "need" | "needProposed">): number {
  return p.need ?? p.needProposed;
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

/** Prošlé (nevypsané a starší 14 dní) se nezobrazuje. */
export function wishExpired(w: { status: string; createdAt: string }, nowMs: number): boolean {
  return w.status !== "vypsano" && Date.parse(w.createdAt) + WISH_DAYS * 86_400_000 <= nowMs;
}

export const WISH_KIND_LABEL: Record<WishKind, string> = {
  atelier: "Ateliér",
  expedice: "Expedice",
  kurz: "Téma kurzu",
};
