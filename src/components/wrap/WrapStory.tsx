"use client";

// Přehrávač wrapu „Tvůj rok v Campu“: příběh ze snímků jako na Instagramu.
// Telefon: přes celou obrazovku, klepnutí vpravo/vlevo, podržením pauza.
// Počítač: příběh uprostřed, šipky vedle, klávesy ← → mezerník Esc.
// Snímek se po pár sekundách sám přepne (konec animace ukazatele nahoře).

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Avatar } from "@/components/Avatar";
import { BadgeIcon } from "@/components/badges/BadgeIcon";
import { BADGE_BY_KEY, badgeTitle } from "@/lib/badges";
import { buildSlides, wrapCard, type WrapCard, type WrapData, type WrapSlide } from "@/lib/wrap";
import { saveWrapCard } from "@/lib/wrap-card";
import styles from "./wrap.module.css";

const LOGO = "M3 20 12 4l9 16zM9.5 20 12 15.5 14.5 20";
const HOLD_MS = 220;

const initialsOf = (name: string) => {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
};

export function WrapStory({ data, onClose }: { data: WrapData; onClose: () => void }) {
  const slides = useMemo(() => buildSlides(data), [data]);
  const card = useMemo(() => wrapCard(data), [data]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasHeld = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const slide = slides[index];
  const last = index === slides.length - 1;

  const next = () => setIndex((i) => Math.min(i + 1, slides.length - 1));
  const prev = () => setIndex((i) => Math.max(i - 1, 0));

  // Klávesy a zamknuté posouvání stránky, dokud je wrap otevřený.
  const keys = useRef({ next, prev, onClose, toggle: () => setPaused((p) => !p) });
  useEffect(() => {
    keys.current = { next, prev, onClose, toggle: () => setPaused((p) => !p) };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") keys.current.next();
      else if (e.key === "ArrowLeft") keys.current.prev();
      else if (e.key === "Escape") keys.current.onClose();
      else if (e.key === " " && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        keys.current.toggle();
      } else return;
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  const startHold = () => {
    wasHeld.current = false;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      wasHeld.current = true;
      setHeld(true);
    }, HOLD_MS);
  };
  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setHeld(false);
  };
  const tap = (go: () => void) => () => {
    if (wasHeld.current) {
      wasHeld.current = false;
      return;
    }
    go();
  };

  const running = !paused && !held;
  const theme = {
    "--w-a": slide.bg[0],
    "--w-b": slide.bg[1],
    "--w-g1": slide.glow[0],
    "--w-g2": slide.glow[1],
  } as CSSProperties;

  return (
    <div ref={dialog} className={styles.overlay} style={theme} role="dialog" aria-modal="true" aria-label="Tvůj rok v Campu" tabIndex={-1}>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.aside}>
        <span className={styles.asideKicker}>ScioCamp</span>
        <span className={styles.asideTitle}>Tvůj rok v Campu</span>
        <span className={styles.asideHint}>Listuj šipkami vedle příběhu nebo na klávesnici (← →), mezerník pozastaví, Esc zavře.</span>
      </div>
      <button type="button" className={styles.arrow} onClick={prev} disabled={index === 0} aria-label="Předchozí snímek">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      </button>

      <div className={styles.story}>
        <div className={styles.glow1} aria-hidden="true" />
        <div className={styles.glow2} aria-hidden="true" />
        <div className={styles.ring} aria-hidden="true" />

        <div className={styles.top}>
          <div className={styles.segments} aria-hidden="true">
            {slides.map((s, i) => (
              <span key={s.key} className={styles.seg}>
                {i < index || (i === index && last) ? (
                  <i style={{ width: "100%" }} />
                ) : i === index ? (
                  <i key={`run-${index}`} className={styles.segRun} style={{ animationPlayState: running ? "running" : "paused" }} onAnimationEnd={next} />
                ) : null}
              </span>
            ))}
          </div>
          <div className={styles.bar}>
            <span className={styles.logo}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={LOGO} /></svg>
            </span>
            <span className={styles.barTitle}>Tvůj rok v Campu</span>
            {data.demo && <span className={styles.demo}>Ukázka</span>}
            <span className={styles.grow} />
            <button type="button" className={styles.iconBtn} onClick={() => setPaused((p) => !p)} aria-label={paused ? "Pokračovat" : "Pozastavit"} aria-pressed={paused}>
              {paused ? (
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14l11-7z" className={styles.fill} /></svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>
              )}
            </button>
            <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Zavřít">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        </div>

        <button
          type="button"
          className={styles.tapPrev}
          aria-label="Předchozí snímek"
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onPointerLeave={endHold}
          onContextMenu={(e) => e.preventDefault()}
          onClick={tap(prev)}
        />
        <button
          type="button"
          className={styles.tapNext}
          aria-label="Další snímek"
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onPointerLeave={endHold}
          onContextMenu={(e) => e.preventDefault()}
          onClick={tap(next)}
        />

        <Slide key={slide.key} slide={slide} card={card} onClose={onClose} />
        <p className={styles.srOnly} aria-live="polite">
          Snímek {index + 1} z {slides.length}
        </p>
      </div>

      <button type="button" className={styles.arrow} onClick={next} disabled={last} aria-label="Další snímek">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
      </button>
    </div>
  );
}

function Slide({ slide, card, onClose }: { slide: WrapSlide; card: WrapCard; onClose: () => void }) {
  return (
    <section className={styles.slide} aria-label={slide.kicker}>
      <span className={`${styles.kicker} ${styles.in}`}>{slide.kicker}</span>
      <h2 className={`${styles.title} ${styles.in} ${styles.d1}`}>{slide.title}</h2>

      {slide.big && (
        <div className={`${styles.big} ${styles.pop} ${styles.d2}`}>
          <span className={styles.bigNum}>{slide.big}</span>
          <span className={styles.bigUnit}>{slide.unit}</span>
        </div>
      )}

      {slide.lines && slide.lines.length > 0 && (
        <div className={styles.lines}>
          {slide.lines.map((l, i) => (
            <div key={i} className={`${styles.line} ${styles.in}`} style={{ animationDelay: `${0.45 + i * 0.18}s` }}>
              <span className={styles.lineValue}>{l.value}</span>
              <span className={styles.lineLabel}>{l.label}</span>
            </div>
          ))}
        </div>
      )}

      {slide.people && (
        <div className={styles.lines}>
          {slide.people.map((p, i) => (
            <div key={p.id} className={`${styles.person} ${styles.in}`} style={{ animationDelay: `${0.4 + i * 0.2}s` }}>
              <span className={styles.rank}>{i + 1}</span>
              <Avatar initials={initialsOf(p.name)} userId={p.id} size={44} />
              <span className={styles.personName}>{p.name}</span>
              <span className={styles.personCount}>
                {p.count.toLocaleString("cs-CZ")} {p.count === 1 ? "zpráva" : p.count < 5 ? "zprávy" : "zpráv"}
              </span>
            </div>
          ))}
        </div>
      )}

      {slide.badges && (
        <div className={styles.badges}>
          {slide.badges.map((b, i) => {
            const def = BADGE_BY_KEY.get(b.key);
            if (!def) return null;
            return (
              <div key={b.key} className={`${styles.badge} ${styles.pop}`} style={{ animationDelay: `${0.4 + i * 0.14}s` }}>
                <BadgeIcon def={def} tier={b.tier} size={72} />
                <span>{badgeTitle(def, b.tier)}</span>
              </div>
            );
          })}
        </div>
      )}

      {slide.type && (
        <div className={`${styles.typeCard} ${styles.pop} ${styles.d2}`}>
          <span className={styles.typeTile}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={slide.type.def.icon} style={{ stroke: slide.type.def.color }} />
            </svg>
          </span>
          <span className={styles.typeName}>{slide.type.def.name}</span>
          <span className={styles.typeDesc}>{slide.type.def.desc}</span>
        </div>
      )}

      {slide.summary && <SummaryCard card={card} onClose={onClose} />}

      {(slide.note || slide.type?.reason) && (
        <p className={`${styles.note} ${styles.in} ${styles.d4}`}>{slide.note ?? slide.type?.reason}</p>
      )}
    </section>
  );
}

function SummaryCard({ card, onClose }: { card: WrapCard; onClose: () => void }) {
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const save = async () => {
    setStatus("busy");
    try {
      await saveWrapCard(card);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };
  const [c0, c1, c2] = card.type.card;
  return (
    <>
      <div className={`${styles.card} ${styles.pop} ${styles.d2}`} style={{ background: `linear-gradient(150deg, ${c0} 0%, ${c1} 45%, ${c2} 100%)` }}>
        <div className={styles.cardHead}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={LOGO} /></svg>
          <span>ScioCamp</span>
          <span className={styles.grow} />
          <span>{card.season}</span>
        </div>
        <span className={styles.cardTile}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={card.type.icon} style={{ stroke: card.type.color }} />
          </svg>
        </span>
        <span className={styles.cardWho}>{card.firstName} je</span>
        <span className={styles.cardType}>{card.type.name}</span>
        <span className={styles.cardShort}>{card.type.short}</span>
        <div className={styles.cardStats}>
          {card.stats.map((s) => (
            <div key={s.label}>
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
        <div className={styles.cardFoot}>
          <span className={styles.cardAvatar} style={{ color: card.type.color }}>
            {card.initials}
          </span>
          <span>{card.fullName}</span>
        </div>
      </div>
      <div className={`${styles.actions} ${styles.in} ${styles.d4}`}>
        <button type="button" className={styles.saveBtn} onClick={save} disabled={status === "busy"}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
          {status === "busy" ? "Ukládám…" : status === "done" ? "Uloženo" : "Uložit kartu"}
        </button>
        <button type="button" className={styles.closeBtn} onClick={onClose}>
          Zavřít
        </button>
      </div>
      {status === "error" && (
        <p role="alert" className={styles.note}>
          Obrázek se nepodařilo uložit. Zkus to znovu, případně si kartu vyfoť.
        </p>
      )}
    </>
  );
}
