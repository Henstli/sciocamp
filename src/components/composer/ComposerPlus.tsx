"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { EMOJI_GROUPS } from "./emoji";
import { GIPHY_KEY, searchGifs, type GifResult } from "./gif";
import styles from "./composer.module.css";

/**
 * Tlačítko „+“ u psaní zprávy: po kliknutí se vysune nabídka Příloha, GIF,
 * Emoji a na telefonu Kamera. Emoji a GIFy se vybírají v panelu nad polem.
 */
export function ComposerPlus({
  onFile,
  onEmoji,
  onGif,
  idPrefix,
}: {
  onFile: (file: File) => void;
  onEmoji: (emoji: string) => void;
  /** Bez handleru se GIF v nabídce neukáže */
  onGif?: (url: string) => void;
  idPrefix: string;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"emoji" | "gif" | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  // Klik mimo / Esc zavře nabídku i panel.
  useEffect(() => {
    if (!open && !panel) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) {
        setOpen(false);
        setPanel(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setPanel(null);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, panel]);

  const pick = (which: "file" | "camera") => {
    setOpen(false);
    (which === "file" ? fileInput : cameraInput).current?.click();
  };
  const showPanel = (p: "emoji" | "gif") => {
    setOpen(false);
    setPanel((cur) => (cur === p ? null : p));
  };

  type Key = "file" | "gif" | "emoji" | "camera";
  const items: { key: Key; label: string; icon: React.ReactNode; phoneOnly?: boolean }[] = [
    { key: "file", label: "Příloha", icon: <Icon name="paperclip" size={18} /> },
    ...(onGif && GIPHY_KEY ? [{ key: "gif" as const, label: "GIF", icon: <Icon name="gif" size={20} /> }] : []),
    { key: "emoji", label: "Emoji", icon: <Icon name="smile" size={18} /> },
    { key: "camera", label: "Kamera", icon: <Icon name="camera" size={18} />, phoneOnly: true },
  ];
  function select(key: Key) {
    if (key === "file" || key === "camera") pick(key);
    else showPanel(key);
  }

  return (
    <div ref={box} className={styles.wrap}>
      <input
        ref={fileInput}
        type="file"
        id={`${idPrefix}-soubor`}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className={styles.plus}
        aria-expanded={open}
        aria-label={open ? "Zavřít nabídku" : "Přidat přílohu, GIF nebo emoji"}
        onClick={() => {
          setPanel(null);
          setOpen((o) => !o);
        }}
      >
        <Icon name="plus" size={20} strokeWidth={2.6} />
      </button>
      <div className={styles.menu} data-open={open} role="menu" aria-hidden={!open}>
        {items.map((it, i) => (
          <button
            key={it.key}
            type="button"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            className={styles.item}
            data-phone-only={it.phoneOnly || undefined}
            style={{ "--i": i } as React.CSSProperties}
            onClick={() => select(it.key)}
          >
            <span className={styles.itemIcon}>{it.icon}</span>
            <span className={styles.itemLabel}>{it.label}</span>
          </button>
        ))}
      </div>
      {panel === "emoji" && <EmojiPanel onPick={onEmoji} />}
      {panel === "gif" && onGif && (
        <GifPanel
          onPick={(url) => {
            setPanel(null);
            onGif(url);
          }}
        />
      )}
    </div>
  );
}

function EmojiPanel({ onPick }: { onPick: (e: string) => void }) {
  const [group, setGroup] = useState(0);
  return (
    <div className={styles.panel} role="dialog" aria-label="Emoji">
      <div className={styles.tabs} role="tablist">
        {EMOJI_GROUPS.map((g, i) => (
          <button key={g.name} type="button" role="tab" aria-selected={i === group} aria-label={g.name} title={g.name} className={styles.tab} onClick={() => setGroup(i)}>
            {g.icon}
          </button>
        ))}
      </div>
      <div className={styles.emojiGrid}>
        {EMOJI_GROUPS[group].items.map((e) => (
          <button key={e} type="button" className={styles.emoji} onClick={() => onPick(e)}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

function GifPanel({ onPick }: { onPick: (url: string) => void }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<{ q: string; items: GifResult[]; error: boolean } | null>(null);
  const loading = state?.q !== query;

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchGifs(query, ctrl.signal)
        .then((items) => setState({ q: query, items, error: false }))
        .catch((e: unknown) => {
          if ((e as Error).name !== "AbortError") setState({ q: query, items: [], error: true });
        });
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  return (
    <div className={styles.panel} role="dialog" aria-label="GIF">
      <input
        className={styles.search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Hledat GIF…"
        aria-label="Hledat GIF"
        autoFocus
      />
      <div className={styles.gifGrid} aria-busy={loading}>
        {state?.error && <p className={styles.note}>GIFy se teď nepodařilo načíst.</p>}
        {!state?.error && state?.items.length === 0 && !loading && <p className={styles.note}>Nic nenalezeno.</p>}
        {state?.items.map((g) => (
          <button key={g.id} type="button" className={styles.gif} onClick={() => onPick(g.url)} aria-label={g.title || "GIF"}>
            {/* eslint-disable-next-line @next/next/no-img-element -- náhledy z Giphy */}
            <img src={g.preview} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      <p className={styles.powered}>GIFy z GIPHY</p>
    </div>
  );
}

/** GIF ve zprávě (zpráva je jen odkaz na Giphy). */
export function GifImage({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={styles.gifMsg} aria-label="GIF">
      {/* eslint-disable-next-line @next/next/no-img-element -- GIF z Giphy */}
      <img src={url} alt="GIF" loading="lazy" />
    </a>
  );
}

/** Vloží text do pole na místo kurzoru (a kurzor posune za něj). */
export function insertAtCursor(input: HTMLInputElement | HTMLTextAreaElement | null, current: string, text: string): string {
  if (!input) return current + text;
  const start = input.selectionStart ?? current.length;
  const end = input.selectionEnd ?? current.length;
  const next = current.slice(0, start) + text + current.slice(end);
  requestAnimationFrame(() => {
    input.focus();
    input.setSelectionRange(start + text.length, start + text.length);
  });
  return next;
}
