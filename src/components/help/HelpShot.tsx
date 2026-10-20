"use client";

// Animovaný snímek kroku návodu: skutečná obrazovka, kurzor dojede k prvku,
// klikne (vlnka), zvýrazní ho a ukáže výsledek — rozbalení, napsaný text,
// vybranou možnost. Přehrává se dokola, když je krok vidět na obrazovce.

import { useEffect, useRef, useState } from "react";
import type { HelpShotData } from "@/lib/help/shots";
import styles from "./help.module.css";

type Phase = "start" | "move" | "press" | "result" | "hold";

const HINT: Record<HelpShotData["action"], string | null> = {
  click: "Klikni",
  point: "Klikni sem",
  type: "Napiš",
  select: "Vyber",
  none: null,
};

/** Kroky animace (ms od začátku). */
const T = { show: 250, move: 450, press: 1450, result: 1800, typeStep: 420, hold: 2600 };

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HelpShot({ shot, label }: { shot: HelpShotData; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>("start");
  const [frame, setFrame] = useState(0);
  const [run, setRun] = useState(0);
  const [still, setStill] = useState(false);
  const last = shot.frames.length - 1;

  // Přehrává se jen krok, který je vidět.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.45 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (reducedMotion()) {
      const t = setTimeout(() => {
        setStill(true);
        setFrame(last);
        setPhase("hold");
      }, 0);
      return () => clearTimeout(t);
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    at(0, () => {
      setFrame(0);
      setPhase("start");
    });
    at(T.move, () => setPhase("move"));
    let end = T.result;
    if (shot.target && shot.action !== "none") {
      at(T.press, () => setPhase("press"));
      at(T.result, () => setPhase("result"));
      if (shot.action === "type") {
        for (let i = 1; i <= last; i++) at(T.result + (i - 1) * T.typeStep, () => setFrame(i));
        end = T.result + Math.max(0, last - 1) * T.typeStep;
      } else if (last > 0) {
        at(T.result, () => setFrame(last));
      }
    }
    at(end + T.hold, () => setRun((r) => r + 1));
    return () => timers.forEach(clearTimeout);
  }, [visible, run, shot, last]);

  const t = shot.target;
  const cx = t ? (t.x + t.w / 2) * 100 : 50;
  const cy = t ? (t.y + t.h / 2) * 100 : 50;
  // Kurzor startuje vpravo dole od prvku a dojede doprostřed.
  const away = phase === "start";
  // Po kliknutí se změní obrazovka (rozbalení) → zvýraznění zmizí. Při psaní
  // kurzor uhne, ať nezakrývá text.
  const changed = (phase === "result" || phase === "hold") && shot.action === "click" && last > 0;
  const aside = (phase === "result" || phase === "hold") && shot.action === "type" && t;
  const cursor = {
    left: `${away ? Math.min(cx + 18, 92) : aside ? Math.min((t.x + t.w) * 100 + 2, 96) : cx}%`,
    top: `${away ? Math.min(cy + 22, 92) : aside ? Math.min((t.y + t.h) * 100 + 4, 96) : cy}%`,
    opacity: changed ? 0 : 1,
  };
  const hint = HINT[shot.action];
  const showRing = t && phase !== "start" && !changed;
  // Bublina nad prvkem, u horního okraje pod ním.
  const hintBelow = t ? t.y < 0.18 : false;

  return (
    <figure className={styles.shot} aria-label={label}>
      <div
        ref={box}
        className={styles.screen}
        style={{ aspectRatio: `${shot.w} / ${shot.h}`, maxWidth: shot.w }}
      >
        {shot.frames.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- statické snímky ve 2× rozlišení, optimalizace netřeba
          <img
            key={src}
            src={src}
            alt={i === 0 ? label : ""}
            aria-hidden={i === 0 ? undefined : true}
            className={styles.frame}
            data-on={i === frame || undefined}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ))}
        {t && (
          <span
            className={styles.ring}
            data-on={showRing || undefined}
            data-press={phase === "press" || undefined}
            style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%`, width: `${t.w * 100}%`, height: `${t.h * 100}%` }}
            aria-hidden="true"
          />
        )}
        {t && hint && (
          <span
            className={styles.hint}
            data-on={showRing || undefined}
            data-below={hintBelow || undefined}
            style={{ left: `${Math.min(Math.max(cx, 8), 92)}%`, top: `${(hintBelow ? t.y + t.h : t.y) * 100}%` }}
            aria-hidden="true"
          >
            {hint}
          </span>
        )}
        {t && !still && shot.action !== "none" && (
          <span className={styles.cursor} style={cursor} aria-hidden="true">
            {phase === "press" && <span className={styles.ripple} />}
            <svg viewBox="0 0 24 24" width="26" height="26">
              <path d="M5 3l14 8.5-6.2 1.4L9.6 19z" fill="#111A33" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </div>
      {!still && (
        <button type="button" className={styles.replay} onClick={() => setRun((r) => r + 1)} aria-label={`Přehrát znovu: ${label}`}>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Přehrát znovu
        </button>
      )}
    </figure>
  );
}
