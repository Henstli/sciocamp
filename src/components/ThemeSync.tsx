"use client";

// Srovná vzhled s volbou v profilu (třeba ji člověk změnil na jiném zařízení)
// a u „Podle zařízení“ sleduje přepnutí světlého/tmavého režimu v systému.

import { useEffect } from "react";
import { THEME_KEY, applyTheme, type ThemePref } from "@/lib/theme";

export function ThemeSync({ pref }: { pref: ThemePref }) {
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      /* nic */
    }
    if (stored !== pref) applyTheme(pref);
    if (pref !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);
  return null;
}
