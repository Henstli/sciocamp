"use client";

// Chat vždy začíná úplně dole a dole zůstává:
// - po otevření (a při přepnutí konverzace — `resetKey`) skočí na konec,
// - když se obsah zvětší (nová zpráva, načtený obrázek, odkaz na přílohu), drží
//   se dole, pokud byl člověk dole (nebo zprávu právě poslal),
// - když si člověk odroluje nahoru číst starší zprávy, nic ho nepřeskočí.

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/** Jak blízko konce (px) se ještě počítá jako „dole“. */
const NEAR = 80;

export function useStickToBottom(ref: RefObject<HTMLElement | null>, resetKey: unknown) {
  const stuck = useRef(true);

  const toBottom = useCallback(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ref]);

  // Otevření / jiná konverzace → dolů ještě před vykreslením (bez probliknutí).
  useLayoutEffect(() => {
    stuck.current = true;
    toBottom();
  }, [resetKey, toBottom]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR;
    };
    const keep = () => {
      if (stuck.current) toBottom();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    // Načtený obrázek (událost load neprobublává, proto zachytávání).
    el.addEventListener("load", keep, true);
    // Nové nebo změněné zprávy.
    const mo = new MutationObserver(keep);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    // Změna velikosti okna / panelu (mobil s klávesnicí, otevření záložky).
    const ro = new ResizeObserver(keep);
    ro.observe(el);
    keep();
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("load", keep, true);
      mo.disconnect();
      ro.disconnect();
    };
  }, [ref, toBottom, resetKey]);

  /** Po odeslání vlastní zprávy: skočit dolů, i když byl člověk výš. */
  const stick = useCallback(() => {
    stuck.current = true;
    toBottom();
  }, [toBottom]);

  return stick;
}
