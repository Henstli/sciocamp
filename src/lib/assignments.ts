// Čisté pomocné funkce pro úkoly (bez přístupu k datům) — běží na serveru i v prohlížeči.

import type { Assignment, LinkItem, Work, WorkState } from "./types";

/** Výsledný stav práce studenta. */
export function workState(a: Pick<Assignment, "kind" | "dueAt">, work: Work | null, now = Date.now()): WorkState {
  if (a.kind === "material") return "material";
  const sub = work?.submission ?? null;
  const rev = work?.review ?? null;
  if (rev && rev.result !== "vraceno") return rev.result;
  if (rev?.result === "vraceno") {
    const resubmitted = sub?.status === "odevzdano" && sub.submittedAt && sub.submittedAt > rev.reviewedAt;
    return resubmitted ? "odevzdano" : "vraceno";
  }
  if (sub?.status === "odevzdano") return "odevzdano";
  if (a.dueAt && new Date(a.dueAt).getTime() < now) return "pozde";
  return "ceka";
}

export const STATE_LABEL: Record<WorkState, string> = {
  material: "Materiál",
  ceka: "Čeká",
  pozde: "Po termínu",
  odevzdano: "Odevzdáno",
  vraceno: "Vráceno k doplnění",
  splneno: "Splněno",
  nesplneno: "Nesplněno",
};

/** Třída štítku z globals.css */
export const STATE_CHIP: Record<WorkState, string> = {
  material: "chip-info",
  ceka: "chip-wait",
  pozde: "chip-late",
  odevzdano: "chip-primary",
  vraceno: "chip-wait",
  splneno: "chip-ok",
  nesplneno: "chip-late",
};

/** Potřebuje student ještě něco udělat? */
export function isOpen(state: WorkState): boolean {
  return state === "ceka" || state === "pozde" || state === "vraceno";
}

/**
 * O kolik student odevzdal po termínu (v ms), nebo null když včas / bez termínu.
 * Znovuodevzdání po vrácení se za pozdní nepočítá — doplnění si vyžádal vyučující.
 */
export function lateBy(a: Pick<Assignment, "dueAt">, work: Work | null): number | null {
  const at = work?.submission?.submittedAt;
  if (!a.dueAt || !at || !work?.submission) return null;
  if (work.submission.status !== "odevzdano" && !work.review) return null;
  if (work.review?.result === "vraceno" || (work.review && at > work.review.reviewedAt)) return null;
  const diff = new Date(at).getTime() - new Date(a.dueAt).getTime();
  return diff > 0 ? diff : null;
}

/** „o 40 min“, „o 3 h“, „o 2 dny“ */
export function formatLate(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `o ${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `o ${h} h`;
  const d = Math.round(h / 24);
  return `o ${d} ${d === 1 ? "den" : d < 5 ? "dny" : "dní"}`;
}

/** Má student práci odevzdanou? Vrácená práce se nepočítá, dokud ji znovu neodevzdá. */
export function isHandedIn(state: WorkState): boolean {
  return state === "odevzdano" || state === "splneno" || state === "nesplneno";
}

/** Čeká práce na vyučujícího? (odevzdaná a neohodnocená, nebo znovu odevzdaná po vrácení) */
export function needsReview(state: WorkState): boolean {
  return state === "odevzdano";
}

export function pointsLabel(points: number | null, max: number | null): string | null {
  if (max === null) return null;
  return points === null ? `– / ${max} b.` : `${points} / ${max} b.`;
}

/** Bezpečný odkaz (jen http/https). */
export function normalizeLink(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function linkTitle(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "docs.google.com") {
      const kind = u.pathname.split("/")[1];
      return { document: "Google Dokument", spreadsheets: "Google Tabulka", presentation: "Google Prezentace", forms: "Google Formulář" }[kind] ?? "Google Disk";
    }
    if (u.hostname === "drive.google.com") return "Google Disk";
    if (u.hostname.endsWith("youtube.com") || u.hostname === "youtu.be") return "Video na YouTube";
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Existující témata úkolů podle třídy (pro nabídku v poli Téma). */
export function topicsByClass(list: { activityId: string; topic: string | null }[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const a of list) {
    if (!a.topic) continue;
    const arr = (map[a.activityId] ??= []);
    if (!arr.includes(a.topic)) arr.push(a.topic);
  }
  return map;
}

/** Odkazy z formuláře: jeden na řádek, volitelně „Název | https://…“. */
export function parseLinks(raw: string): { links: LinkItem[]; bad: string | null } {
  const links: LinkItem[] = [];
  for (const line of raw.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [maybeTitle, maybeUrl] = line.includes("|") ? line.split("|").map((x) => x.trim()) : [null, line];
    const url = normalizeLink(maybeUrl ?? "");
    if (!url) return { links, bad: line };
    links.push({ title: maybeTitle || linkTitle(url), url });
  }
  return { links: links.slice(0, 20), bad: null };
}
