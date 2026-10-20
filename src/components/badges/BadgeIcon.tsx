"use client";

// Odznak: šestiúhelník s kovovým okrajem podle úrovně, výplní v barvě
// kategorie a ikonou. Nezískaný je šedý, tajný nezískaný má otazník.

import { useId } from "react";
import { badgeMetal, type BadgeCategory, type BadgeDef, type BadgeMetal } from "@/lib/badges";

const CATEGORY: Record<BadgeCategory, [string, string]> = {
  start: ["#3A4560", "#6B7899"],
  uceni: ["#2F5FCC", "#6D95EE"],
  dobro: ["#0F6B5F", "#2FA594"],
  komunita: ["#5B4BC4", "#8C7EE6"],
  vyuka: ["#9A5B00", "#E0A43C"],
  tajne: ["#111A33", "#3A4560"],
};
const METAL: Record<BadgeMetal, [string, string]> = {
  bronz: ["#A8642E", "#E8B27A"],
  stribro: ["#8E99AD", "#EEF2F8"],
  zlato: ["#B8860B", "#FBE38A"],
  vzacny: ["#B8860B", "#FFF4C2"],
  jeden: ["#AEB8C9", "#F4F6FB"],
  zadny: ["#C3CBDA", "#E8ECF3"],
};
const GREY: [string, string] = ["#9AA4B5", "#C3CBDA"];
const SECRET_ICON = "M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .8-1 1.5V14M12 18v.01";

/** Hlavní barva kategorie (jiskry, záře). */
export const categoryGlow = (c: BadgeCategory) => CATEGORY[c][1];

export function BadgeIcon({
  def,
  tier,
  size = 64,
  title,
}: {
  def: BadgeDef;
  /** 0 = nezískaný */
  tier: number;
  size?: number;
  /** Popisek pro čtečky (bez něj je odznak jen ozdoba) */
  title?: string;
}) {
  const id = useId().replace(/:/g, "");
  const locked = tier <= 0;
  const [c1, c2] = locked ? GREY : CATEGORY[def.category];
  const [m1, m2] = METAL[badgeMetal(def, tier)];
  const icon = locked && def.secret ? SECRET_ICON : def.icon;
  return (
    <svg
      viewBox="0 0 100 112"
      width={size}
      height={Math.round(size * 1.12)}
      style={{ display: "block", overflow: "visible", flex: "none" }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={m1} />
          <stop offset="0.5" stopColor={m2} />
          <stop offset="1" stopColor={m1} />
        </linearGradient>
        <linearGradient id={`c${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c2} />
          <stop offset="1" stopColor={c1} />
        </linearGradient>
      </defs>
      <path d="M50 6 93.3 31v50L50 106 6.7 81V31z" fill={`url(#m${id})`} stroke={`url(#m${id})`} strokeWidth={8} strokeLinejoin="round" />
      <path d="M50 18 83 37v38L50 94 17 75V37z" fill={`url(#c${id})`} stroke={`url(#c${id})`} strokeWidth={5} strokeLinejoin="round" />
      <path d="M50 18 83 37 50 56 17 37z" fill="#FFFFFF" opacity={0.14} />
      <svg x="30" y="36" width="40" height="40" viewBox="0 0 24 24">
        <path d={icon} fill="none" stroke="#FFFFFF" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </svg>
  );
}
