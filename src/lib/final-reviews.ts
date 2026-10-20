// Závěrečné hodnocení kurzů, ateliérů a expedic (splněno / nesplněno + slovní hodnocení).

import type { ActivityKind } from "./types";

export type FinalResult = "splneno" | "nesplneno";

export type FinalReview = {
  activityId: string;
  studentId: string;
  result: FinalResult;
  feedback: string;
  reviewedBy: string;
  reviewedAt: string;
};

/** Uzavřená třída = hodnocení zveřejněná studentům */
export type Closure = { activityId: string; closedAt: string; closedBy: string };

export const GRADABLE: ActivityKind[] = ["kurz", "atelier", "expedice"];
export const isGradable = (kind: ActivityKind) => GRADABLE.includes(kind);

export const FINAL_LABEL: Record<FinalResult, string> = { splneno: "Splněno", nesplneno: "Nesplněno" };
export const FINAL_CHIP: Record<FinalResult, string> = { splneno: "chip-ok", nesplneno: "chip-late" };
