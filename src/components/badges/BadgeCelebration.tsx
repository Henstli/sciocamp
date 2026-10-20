"use client";

// Animace získání odznaku. Při otevření aplikace (a při přechodu mezi
// stránkami nejvýš jednou za minutu) se přepočítají odznaky; nové se ukážou
// jeden po druhém: odznak se vyklopí, projede ho lesk a odletí jiskry.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { markBadgesSeen, refreshBadges, showBadge } from "@/lib/actions/badges";
import { BADGE_BY_KEY, badgeMetal, earnedText, tierLabel, type EarnedBadge } from "@/lib/badges";
import { BadgeIcon, categoryGlow } from "./BadgeIcon";
import styles from "./badges.module.css";

/** Jak často nejdřív znovu přepočítat při přechodu mezi stránkami (ms). */
const REFRESH_EVERY = 60_000;
/** Ukázkový režim: animaci ukázat jen jednou za prohlížeč. */
const DEMO_SEEN_KEY = "sciocamp-demo-odznaky";

const PARTICLES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  return { dx: Math.round(Math.sin(angle) * 150), dy: Math.round(-Math.cos(angle) * 150), big: i % 3 === 0, round: i % 2 === 0 };
});

export function BadgeCelebration({ live }: { live: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [queue, setQueue] = useState<EarnedBadge[]>([]);
  const [index, setIndex] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastRun = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (now - lastRun.current < REFRESH_EVERY) return;
    lastRun.current = now;
    let cancelled = false;
    if (!live) {
      try {
        if (window.localStorage.getItem(DEMO_SEEN_KEY)) return;
      } catch {
        return;
      }
    }
    void refreshBadges().then((list) => {
      if (cancelled || list.length === 0) return;
      setQueue((q) => (q.length > 0 ? q : list));
      setIndex(0);
      // Nová oznámení o odznacích ve zvonečku a čísla v menu.
      if (live) router.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, live, router]);

  const current = queue[index];
  const def = current ? BADGE_BY_KEY.get(current.key) : undefined;

  function finish(keys: string[]) {
    if (live) void markBadgesSeen(keys);
    else {
      try {
        window.localStorage.setItem(DEMO_SEEN_KEY, "1");
      } catch {
        // bez úložiště se animace ukáže znovu, nevadí
      }
    }
  }

  function next() {
    if (!current) return;
    finish([current.key]);
    setNote(null);
    if (index + 1 < queue.length) setIndex(index + 1);
    else {
      setQueue([]);
      setIndex(0);
    }
  }

  function skipAll() {
    finish(queue.slice(index).map((b) => b.key));
    setQueue([]);
    setIndex(0);
    setNote(null);
  }

  async function exhibit() {
    if (!current) return;
    setBusy(true);
    const res = await showBadge(current.key);
    setBusy(false);
    if (res.full) return setNote("Vystavené máš už 3 odznaky. Vyměnit je můžeš ve svém profilu.");
    if (res.error) return setNote(res.error);
    next();
  }

  // Esc = „Super“.
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") next();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!current || !def) return null;

  // Vzácné odznaky září zlatě, ostatní v barvě kategorie.
  const glow = def.rare ? "#F5C842" : categoryGlow(def.category);
  const metal = badgeMetal(def, current.tier);
  const name = def.levels.length > 1 ? `${def.name} ${["", "I", "II", "III"][current.tier]}` : def.name;

  return (
    <div className={styles.overlay} role="presentation">
      {/* key = nový odznak → animace znovu od začátku */}
      <div key={`${current.key}-${current.tier}`} className={styles.card} role="dialog" aria-modal="true" aria-labelledby="odznak-nazev">
        {queue.length > 1 && (
          <span className={styles.counter}>
            {index + 1} / {queue.length}
          </span>
        )}
        <div className={styles.stage}>
          <div className={styles.rays} aria-hidden="true">
            <div className={styles.raysInner} style={{ background: `repeating-conic-gradient(from 0deg, ${glow} 0deg 8deg, transparent 8deg 22deg)` }} />
          </div>
          <div className={styles.glow} style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 70%)` }} aria-hidden="true" />
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className={styles.particle}
              aria-hidden="true"
              style={
                {
                  "--dx": `${p.dx}px`,
                  "--dy": `${p.dy}px`,
                  width: p.big ? 12 : 8,
                  height: p.big ? 12 : 8,
                  borderRadius: p.round ? "50%" : 2,
                  background: i % 2 === 0 ? glow : "#FBE38A",
                } as CSSProperties
              }
            />
          ))}
          <div className={styles.badge}>
            <BadgeIcon def={def} tier={current.tier} size={150} title={`Odznak ${name}`} />
            <div className={styles.shineClip} aria-hidden="true">
              <div className={styles.shine} />
            </div>
          </div>
        </div>
        <span className={styles.kicker}>{current.tier > 1 ? "Nová úroveň" : "Nový odznak"}</span>
        <h2 id="odznak-nazev" className={styles.title}>
          {name}
        </h2>
        <span className={styles.chip} data-metal={metal}>
          {tierLabel(def, current.tier)}
        </span>
        <p className={styles.desc}>{earnedText(def, current.tier)}</p>
        {note && (
          <p className={styles.note} role="status">
            {note} <Link href="/profil#odznaky" onClick={next}>Otevřít profil</Link>
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className="btn btn-outline" onClick={next}>
            {index + 1 < queue.length ? "Další" : "Super"}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void exhibit()} disabled={busy}>
            {busy ? "Vystavuji…" : "Vystavit na profil"}
          </button>
        </div>
        {queue.length - index > 1 && (
          <button type="button" className={styles.skip} onClick={skipAll}>
            Přeskočit zbytek ({queue.length - index - 1})
          </button>
        )}
      </div>
    </div>
  );
}
