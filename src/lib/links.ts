import type { Activity } from "./types";

/** Sekce aplikace podle druhu aktivity. */
export const KIND_SECTION: Record<Activity["kind"], { href: string; label: string }> = {
  kurz: { href: "/kurzy", label: "Kurzy" },
  atelier: { href: "/ateliery", label: "Ateliéry" },
  ostatni: { href: "/udalosti", label: "Události" },
  expedice: { href: "/expedice", label: "Expedice" },
};

/** Adresa detailu třídy (kurz, ateliér, událost, expedice). */
export function activityHref(activity: Pick<Activity, "id" | "kind">): string {
  return `${KIND_SECTION[activity.kind].href}/${activity.id}`;
}

export const KIND_LABEL: Record<Activity["kind"], string> = {
  kurz: "Kurz",
  atelier: "Ateliér",
  ostatni: "Událost",
  expedice: "Expedice",
};
