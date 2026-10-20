"use client";

// Profil → Vzhled: světlý, tmavý, nebo podle nastavení zařízení.

import { useState, useSyncExternalStore, useTransition } from "react";
import { setTheme } from "@/lib/actions/profile";
import { THEME_KEY, applyTheme, isThemePref, type ThemePref } from "@/lib/theme";
import styles from "./ThemePicker.module.css";

const OPTIONS: { value: ThemePref; label: string; hint: string }[] = [
  { value: "light", label: "Světlý", hint: "Klasický vzhled" },
  { value: "dark", label: "Tmavý", hint: "Šetří oči večer" },
  { value: "system", label: "Podle zařízení", hint: "Řídí se telefonem / počítačem" },
];

export function ThemePicker({ initial, live }: { initial: ThemePref; live: boolean }) {
  // V ukázkovém režimu se volba pamatuje jen v prohlížeči (localStorage).
  const stored = useSyncExternalStore(
    (cb) => {
      addEventListener("storage", cb);
      return () => removeEventListener("storage", cb);
    },
    () => {
      try {
        return localStorage.getItem(THEME_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const [picked, setValue] = useState<ThemePref | null>(null);
  const value: ThemePref = picked ?? (!live && isThemePref(stored) ? stored : initial);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const pick = (pref: ThemePref) => {
    setValue(pref);
    applyTheme(pref);
    setError(null);
    start(async () => {
      const res = await setTheme(pref);
      if (res.error) setError(res.error);
    });
  };

  return (
    <section className={`card ${styles.card}`} aria-label="Vzhled">
      <div>
        <h2 className={styles.title}>Vzhled</h2>
        <p className={styles.hint}>
          {live ? "Volba platí na všech tvých zařízeních." : "V ukázkovém režimu si vzhled pamatuje jen tenhle prohlížeč."}
        </p>
      </div>
      <div className={styles.options} role="radiogroup" aria-label="Vzhled aplikace">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={styles.option}
            onClick={() => pick(o.value)}
          >
            <span className={styles.preview} data-kind={o.value} aria-hidden="true">
              <span className={styles.pSide} />
              <span className={styles.pMain}>
                <span className={styles.pBar} />
                <span className={styles.pCard} />
              </span>
            </span>
            <span className={styles.label}>{o.label}</span>
            <span className={styles.small}>{o.hint}</span>
          </button>
        ))}
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </section>
  );
}
