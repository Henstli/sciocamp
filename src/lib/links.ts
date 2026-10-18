import type { Activity } from "./types";

/** Adresa detailu třídy. Ateliéry mají vlastní sekci, kurzy a ostatní aktivity sdílí /kurzy. */
export function activityHref(activity: Pick<Activity, "id" | "kind">): string {
  return activity.kind === "atelier" ? `/ateliery/${activity.id}` : `/kurzy/${activity.id}`;
}

export const KIND_LABEL: Record<Activity["kind"], string> = {
  kurz: "Kurz",
  atelier: "Ateliér",
  ostatni: "Ostatní",
};
