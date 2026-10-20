"use client";

// Animovaný snímek kroku návodu: skutečná obrazovka, kurzor dojede k prvku,
// klikne (vlnka), zvýrazní ho a ukáže výsledek — rozbalení, napsaný text,
// vybranou možnost. Přehrává se dokola, když je krok vidět na obrazovce.

import { useEffect, useRef, useState } from "react";
import type { HelpShotData } from "@/lib/help/shots";
import styles from "./help.module.css";

type Phase = "start" | "show" | "move" | "press" | "result" | "hold" | "end";


/** Kroky animace (ms od začátku). */
const T = { show: 250, move: 450, press: 1450, result: 1850, typeStep: 170, hold: 2600 };

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
  // Animace začne, až jsou načtené všechny snímky kroku (jinak by při psaní problikávaly).
  const [ready, setReady] = useState(false);
  /** Kolik písmen je už „napsaných“ (null = překryv pro psaní není vidět) */
  const [typed, setTyped] = useState<number | null>(null);
  const last = shot.frames.length - 1;
  const typing = shot.action === "type" ? shot.typing : undefined;

  // Přehrává se jen krok, který je vidět.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.45 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || ready) return;
    let alive = true;
    const imgs = Array.from(box.current?.querySelectorAll("img") ?? []);
    void Promise.all(imgs.map((img) => img.decode().catch(() => undefined))).then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [visible, ready]);

  useEffect(() => {
    if (!visible || !ready) return;
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
      setTyped(null);
      setPhase("start");
    });
    at(T.show, () => setPhase("show"));
    at(T.move, () => setPhase("move"));
    let end = T.result;
    if (shot.target && shot.action !== "none") {
      // Kliknutí (vlnka) u každého kroku s cílem — i u „ukázat“, kde se obrazovka nemění.
      at(T.press, () => setPhase("press"));
      at(T.result, () => setPhase("result"));
      if (typing) {
        // Hotový snímek (pole s fokusem a celým textem) + překryv, ve kterém se
        // text píše po písmenech; nakonec překryv zmizí a zůstane skutečný text.
        const len = typing.text.length;
        const step = Math.max(28, Math.min(70, 2400 / Math.max(len, 1)));
        at(T.result, () => {
          setFrame(last);
          setTyped(0);
        });
        for (let i = 1; i <= len; i++) at(T.result + 250 + i * step, () => setTyped(i));
        end = T.result + 250 + len * step + 500;
        at(end, () => setTyped(null));
      } else if (last > 0) {
        at(T.result, () => setFrame(last));
      }
    }
    // Před opakováním kurzor a zvýraznění plynule zmizí, pak vše začne znovu.
    at(end + T.hold - 400, () => setPhase("end"));
    at(end + T.hold, () => setRun((r) => r + 1));
    return () => timers.forEach(clearTimeout);
  }, [visible, ready, run, shot, last, typing]);

  const t = shot.target;
  const cx = t ? (t.x + t.w / 2) * 100 : 50;
  const cy = t ? (t.y + t.h / 2) * 100 : 50;
  // Kurzor startuje vpravo dole od prvku a dojede doprostřed.
  const away = phase === "start" || phase === "show";
  // Po kliknutí se změní obrazovka (rozbalení) → zvýraznění zmizí. Při psaní
  // kurzor uhne, ať nezakrývá text.
  const changed = (phase === "result" || phase === "hold") && shot.action === "click" && last > 0;
  const aside = (phase === "result" || phase === "hold") && shot.action === "type" && t;
  const cursor = {
    left: `${away ? Math.min(cx + 18, 92) : aside ? Math.min((t.x + t.w) * 100 + 2, 96) : cx}%`,
    top: `${away ? Math.min(cy + 22, 92) : aside ? Math.min((t.y + t.h) * 100 + 4, 96) : cy}%`,
    opacity: phase === "start" || phase === "end" ? 0 : 1,
    // Na začátku kurzor skočí na výchozí místo neviditelně (bez přejezdu).
    ...(phase === "start" ? { transition: "none" } : {}),
  };
  const showRing = t && phase !== "start" && phase !== "show" && phase !== "end" && !changed;

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
            // Po kliknutí se obrazovka změní hned (jako ve skutečnosti), bez prolínání dvou rozvržení.
            data-instant={i > 0 || undefined}
            loading={i === 0 ? "lazy" : "eager"}
            decoding="async"
            draggable={false}
          />
        ))}
        {typing && typed !== null && (
          <span
            className={styles.typing}
            aria-hidden="true"
            style={{
              left: `${typing.box.x * 100}%`,
              top: `${typing.box.y * 100}%`,
              width: `${typing.box.w * 100}%`,
              height: `${typing.box.h * 100}%`,
              background: typing.background === "rgba(0, 0, 0, 0)" ? "#fff" : typing.background,
              color: typing.color,
              fontSize: `${typing.fontSize * 100}cqw`,
              lineHeight: `${typing.lineHeight * 100}cqw`,
              fontWeight: typing.fontWeight,
              whiteSpace: typing.multiline ? "pre-wrap" : "pre",
            }}
          >
            {typing.text.slice(0, typed)}
            <i className={styles.caret} />
          </span>
        )}
        {t && (
          <span
            className={styles.ring}
            data-bare={t.bare || undefined}
            data-on={showRing || undefined}
            data-press={phase === "press" || undefined}
            style={{
              left: `${t.x * 100}%`,
              top: `${t.y * 100}%`,
              width: `${t.w * 100}%`,
              height: `${t.h * 100}%`,
              borderRadius: t.r ? `${t.r * 100}cqw` : 6,
            }}
            aria-hidden="true"
          />
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
