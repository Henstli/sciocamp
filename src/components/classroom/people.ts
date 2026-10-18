import type { Role } from "@/lib/types";

/** Člověk, jak ho potřebuje UI (jméno, iniciály, role pro barvu avataru). */
export type Person = { id: string; name: string; initials: string; role: Role };

export const UNKNOWN_PERSON: Person = { id: "?", name: "Neznámý uživatel", initials: "?", role: "student" };

/** Barva avataru: já, student, vyučující/admin. */
export function toneFor(p: Pick<Person, "id" | "role">, meId: string) {
  if (p.id === meId) return "me" as const;
  return p.role === "student" ? ("student" as const) : ("late" as const);
}
