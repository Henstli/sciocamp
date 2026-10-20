// Snímky návodů vyrobené skriptem `npm run napoveda:snimky`.
import data from "./shots.json";

export type HelpShotData = {
  /** Šířka a výška výřezu v px (snímky jsou ve 2× rozlišení) */
  w: number;
  h: number;
  /** 0 = před akcí, další = psaní nebo stav po kliknutí */
  frames: string[];
  /** Prvek v podílech výřezu (0–1) */
  /** r = zaoblení rohů v podílech šířky výřezu; bare = textový odkaz (zvýrazňovač místo rámečku) */
  target: { x: number; y: number; w: number; h: number; r?: number; bare?: boolean } | null;
  action: "click" | "point" | "type" | "select" | "none";
  /** Psaní: obsah pole v podílech výřezu, písmo v podílech šířky výřezu */
  typing?: {
    text: string;
    box: { x: number; y: number; w: number; h: number };
    fontSize: number;
    lineHeight: number;
    fontWeight: string;
    color: string;
    background: string;
    multiline: boolean;
  };
};

const SHOTS = data as unknown as Record<string, (HelpShotData | null)[]>;

export function shotFor(slug: string, step: number): HelpShotData | null {
  return SHOTS[slug]?.[step] ?? null;
}

/** První snímek návodu (náhled v přehledu). */
export function coverFor(slug: string, step?: number): HelpShotData | null {
  return (step !== undefined ? SHOTS[slug]?.[step] : null) ?? SHOTS[slug]?.find((s) => s !== null) ?? null;
}
