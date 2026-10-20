// Důležitá oznámení od admina na Domově.

export type AnnouncementAudience = "vsichni" | "studenti" | "vyucujici";

export type Announcement = {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  audience: AnnouncementAudience;
  endsAt: string | null;
  createdBy: string;
  createdAt: string;
};

export const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  vsichni: "Všichni",
  studenti: "Studenti",
  vyucujici: "Učitelé a admini",
};

export function isAudience(v: unknown): v is AnnouncementAudience {
  return v === "vsichni" || v === "studenti" || v === "vyucujici";
}

/** Platí oznámení teď? */
export function announcementActive(a: Pick<Announcement, "endsAt">, now: number): boolean {
  return !a.endsAt || new Date(a.endsAt).getTime() > now;
}
