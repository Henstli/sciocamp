"use client";

// Moje sbírka odznaků v profilu: všechny odznaky po kategoriích, postup
// k další úrovni a výběr až 3 odznaků, které se vystaví na kartě profilu.

import { useEffect, useRef, useState, useTransition } from "react";
import { setShownBadges } from "@/lib/actions/badges";
import {
  BADGE_BY_KEY,
  BADGE_CATEGORIES,
  badgeDescription,
  badgeMetal,
  badgeTitle,
  nextGoal,
  tierLabel,
  type BadgeProgress,
} from "@/lib/badges";
import { formatShortDate } from "@/lib/time";
import { BadgeIcon } from "./BadgeIcon";
import styles from "./badges.module.css";

export function BadgeCollection({ progress, shown, live }: { progress: BadgeProgress[]; shown: string[]; live: boolean }) {
  const [picked, setPicked] = useState(shown);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const earned = progress.filter((p) => p.tier > 0).length;

  const toggle = (key: string) => {
    const next = picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key];
    if (next.length > 3) return setError("Vystavit jde nejvýš 3 odznaky. Nejdřív jeden odeber.");
    setError(null);
    const before = picked;
    setPicked(next);
    start(async () => {
      const res = await setShownBadges(next);
      if (res.error) {
        setPicked(before);
        setError(res.error);
      }
    });
  };

  return (
    <section id="odznaky" aria-label="Odznaky" className={`card ${styles.collection}`} style={{ padding: "22px 24px", scrollMarginTop: 16 }}>
      <div className={styles.collectionHead}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Odznaky</h2>
        <p>
          Získáno {earned} z {progress.length} · na kartě profilu vystavíš až 3 ({picked.length} / 3)
          {!live && " · ukázkový režim: výběr se neukládá"}
        </p>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {BADGE_CATEGORIES.map((cat) => {
        const items = progress.filter((p) => BADGE_BY_KEY.get(p.key)?.category === cat.key);
        if (items.length === 0) return null;
        return (
          <div key={cat.key} className={styles.group}>
            <div className={styles.groupHead}>
              <span className={styles.dot} data-cat={cat.key} aria-hidden="true" />
              <h3>{cat.title}</h3>
              <span>{cat.hint}</span>
            </div>
            <div className={styles.grid}>
              {items.map((p) => {
                const def = BADGE_BY_KEY.get(p.key)!;
                const locked = p.tier <= 0;
                const hidden = locked && !!def.secret;
                const goal = nextGoal(def, p);
                const on = picked.includes(p.key);
                return (
                  <article key={p.key} className={styles.item} data-locked={locked} data-shown={on}>
                    <BadgeIcon def={def} tier={p.tier} size={84} />
                    <span className={styles.itemName}>{hidden ? "???" : badgeTitle(def, p.tier)}</span>
                    <span className={styles.chip} data-metal={locked ? undefined : badgeMetal(def, p.tier)} style={{ animation: "none" }}>
                      {hidden ? "Tajný" : tierLabel(def, p.tier)}
                    </span>
                    <span className={styles.itemDesc}>{hidden ? def.secret : badgeDescription(def)}</span>
                    {goal && !hidden ? (
                      <div className={styles.progress}>
                        <div className={styles.bar} data-cat={def.category} role="progressbar" aria-valuemin={0} aria-valuemax={goal.target} aria-valuenow={Math.min(p.value, goal.target)} aria-label={`Postup: ${def.name}`}>
                          <span style={{ width: `${goal.pct}%` }} />
                        </div>
                        <span className={styles.progressText}>
                          {locked ? "" : "Další úroveň: "}
                          {Math.min(p.value, goal.target)} / {goal.target}
                        </span>
                      </div>
                    ) : (
                      !locked && p.earnedAt && <span className={styles.earned}>Získáno {formatShortDate(p.earnedAt)}</span>
                    )}
                    {!locked && (
                      <button
                        type="button"
                        className={styles.showBtn}
                        aria-pressed={on}
                        disabled={pending || (!on && picked.length >= 3)}
                        onClick={() => toggle(p.key)}
                        title={!on && picked.length >= 3 ? "Vystavené máš už 3, nejdřív jeden odeber" : undefined}
                      >
                        {on ? "Vystaveno ✓" : "Vystavit"}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/**
 * Vystavené odznaky na kartě profilu (vlastní i cizí): jen odznaky, název,
 * úroveň a popis se ukážou při najetí myší, fokusu nebo po klepnutí.
 */
export function ShownBadges({ badges }: { badges: { key: string; tier: number }[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const box = useRef<HTMLUListElement>(null);

  // Klepnutí mimo nebo Esc bublinu zavře.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <ul ref={box} className={styles.shown} aria-label="Vystavené odznaky">
      {badges.map((b) => {
        const def = BADGE_BY_KEY.get(b.key as BadgeProgress["key"]);
        if (!def) return null;
        const tipId = `odznak-tip-${b.key}`;
        return (
          <li key={b.key} className={styles.shownItem}>
            <button
              type="button"
              className={styles.shownBtn}
              aria-describedby={tipId}
              aria-expanded={open === b.key}
              aria-label={badgeTitle(def, b.tier)}
              onClick={() => setOpen((cur) => (cur === b.key ? null : b.key))}
            >
              <BadgeIcon def={def} tier={b.tier} size={46} />
            </button>
            <span id={tipId} role="tooltip" className={styles.tip} data-open={open === b.key}>
              <span className={styles.tipName}>{badgeTitle(def, b.tier)}</span>
              <span className={styles.tipTier}>{tierLabel(def, b.tier)}</span>
              <span className={styles.tipDesc}>{badgeDescription(def)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
