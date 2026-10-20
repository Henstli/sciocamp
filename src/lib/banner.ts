// Barvy horního pruhu profilu. Odstíny ladí s primární modrou (stejná sytost a jas).

export const BANNER_COLORS = [
  { id: "modra", label: "Modrá", swatch: "#3B6FE0" },
  { id: "fialova", label: "Fialová", swatch: "#6B57DA" },
  { id: "ruzova", label: "Růžová", swatch: "#D64D97" },
  { id: "cervena", label: "Červená", swatch: "#D9524C" },
  { id: "zluta", label: "Žlutá", swatch: "#E3A21A" },
  { id: "zelena", label: "Zelená", swatch: "#21946A" },
] as const;

export type BannerColor = (typeof BANNER_COLORS)[number]["id"];

export function isBannerColor(v: unknown): v is BannerColor {
  return BANNER_COLORS.some((c) => c.id === v);
}
