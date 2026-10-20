"use client";

// Akce se zprávou společné pro Zprávy, chat třídy a týmový chat:
// lišta u zprávy (reakce, odpověď, další), reakce pod zprávou, citace
// odpovědi, pruh nad polem (odpovídáš / upravuješ) a připnuté zprávy.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Icon } from "../Icon";
import { EmojiPanel } from "../composer/ComposerPlus";
import { QUICK_REACTIONS } from "@/lib/chat";
import type { ChatReaction } from "@/lib/types";
import styles from "./chat.module.css";

/** Prvek zprávy v chatu (cíl pro skok z citace nebo připnuté lišty). */
export const messageDomId = (id: string) => `zprava-${id}`;

/** Najede na zprávu a krátce ji zvýrazní. Vrací false, když zpráva není načtená. */
export function jumpToMessage(id: string): boolean {
  const el = document.getElementById(messageDomId(id));
  if (!el) return false;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.setAttribute("data-flash", "true");
  window.setTimeout(() => el.removeAttribute("data-flash"), 1600);
  return true;
}

// ---------------------------------------------------------------------------
// Plovoucí okno u tlačítka (mimo posuvný seznam, aby se neořízlo)
// ---------------------------------------------------------------------------

function useFloating(open: boolean, close: () => void, align: "start" | "end") {
  const anchor = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  // Umístění: nad tlačítko, když se tam vejde, jinak pod něj; vždy v okně.
  // Při posouvání chatu (i když přijde nová zpráva) okno jde s tlačítkem.
  useLayoutEffect(() => {
    if (!open || !anchor.current || !pop.current) return;
    const place = () => {
      if (!anchor.current || !pop.current) return;
      const a = anchor.current.getBoundingClientRect();
      const p = pop.current.getBoundingClientRect();
      const gap = 6;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const top = a.top - p.height - gap >= 8 ? a.top - p.height - gap : Math.min(a.bottom + gap, vh - p.height - 8);
      const left = align === "end" ? a.right - p.width : a.left;
      pop.current.style.top = `${Math.max(8, top)}px`;
      pop.current.style.left = `${Math.min(Math.max(8, left), vw - p.width - 8)}px`;
      pop.current.style.visibility = "visible";
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(pop.current);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (anchor.current?.contains(t) || pop.current?.contains(t)) return;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { anchor, pop };
}

function Floating({ popRef, children, label }: { popRef: RefObject<HTMLDivElement | null>; children: ReactNode; label: string }) {
  return (
    <div ref={popRef} className={styles.floating} role="dialog" aria-label={label}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lišta u zprávy
// ---------------------------------------------------------------------------

export function MessageTools({
  align,
  myReactions,
  canEdit,
  canDelete,
  canPin,
  pinned,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onPin,
}: {
  /** U mých zpráv (vpravo) se okna zarovnají doprava */
  align: "start" | "end";
  /** Emoji, které jsem u zprávy už dal(a) */
  myReactions: string[];
  canEdit: boolean;
  canDelete: boolean;
  canPin: boolean;
  pinned: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPin: () => void;
}) {
  const [open, setOpen] = useState<null | "react" | "more" | "confirm">(null);
  const [all, setAll] = useState(false);
  const close = () => {
    setOpen(null);
    setAll(false);
  };
  const { anchor, pop } = useFloating(open !== null, close, align);
  const hasMore = canEdit || canDelete || canPin;

  const react = (emoji: string) => {
    onReact(emoji);
    close();
  };

  return (
    <div ref={anchor} className={styles.tools} data-open={open !== null} data-align={align}>
      <button type="button" className={styles.tool} aria-label="Reagovat" title="Reagovat" aria-expanded={open === "react"} onClick={() => setOpen(open === "react" ? null : "react")}>
        <Icon name="smile" size={16} />
      </button>
      <button type="button" className={styles.tool} aria-label="Odpovědět" title="Odpovědět" onClick={onReply}>
        <Icon name="reply" size={16} />
      </button>
      {hasMore && (
        <button type="button" className={styles.tool} aria-label="Další akce" title="Další akce" aria-expanded={open === "more" || open === "confirm"} onClick={() => setOpen(open ? null : "more")}>
          <Icon name="more" size={16} />
        </button>
      )}

      {open === "react" && (
        <Floating popRef={pop} label="Reakce">
          {all ? (
            <EmojiPanel className={styles.emojiAll} onPick={react} />
          ) : (
            <div className={styles.quick}>
              {QUICK_REACTIONS.map((e) => (
                <button key={e} type="button" className={styles.quickEmoji} data-mine={myReactions.includes(e)} aria-pressed={myReactions.includes(e)} onClick={() => react(e)}>
                  {e}
                </button>
              ))}
              <button type="button" className={styles.quickMore} aria-label="Vybrat jiné emoji" title="Jiné emoji" onClick={() => setAll(true)}>
                <Icon name="plus" size={18} />
              </button>
            </div>
          )}
        </Floating>
      )}

      {open === "more" && (
        <Floating popRef={pop} label="Akce se zprávou">
          <div className={styles.menu} role="menu">
            {canEdit && (
              <button type="button" role="menuitem" className={styles.menuItem} onClick={() => (close(), onEdit())}>
                <Icon name="edit" size={16} /> Upravit
              </button>
            )}
            {canPin && (
              <button type="button" role="menuitem" className={styles.menuItem} onClick={() => (close(), onPin())}>
                <Icon name="pushpin" size={16} /> {pinned ? "Odepnout" : "Připnout"}
              </button>
            )}
            {canDelete && (
              <button type="button" role="menuitem" className={`${styles.menuItem} ${styles.danger}`} onClick={() => setOpen("confirm")}>
                <Icon name="trash" size={16} /> Smazat
              </button>
            )}
          </div>
        </Floating>
      )}

      {open === "confirm" && (
        <Floating popRef={pop} label="Smazat zprávu">
          <div className={styles.confirm}>
            <p>Smazat zprávu? Zmizí všem a nejde to vrátit.</p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.confirmNo} onClick={close}>
                Zrušit
              </button>
              <button type="button" className={styles.confirmYes} onClick={() => (close(), onDelete())}>
                Smazat
              </button>
            </div>
          </div>
        </Floating>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Smazaná zpráva
// ---------------------------------------------------------------------------

export function DeletedNote({ label, align = "start" }: { label: string; align?: "start" | "end" }) {
  return (
    <div className={styles.deletedNote} data-align={align}>
      <Icon name="trash" size={13} />
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reakce pod zprávou
// ---------------------------------------------------------------------------

export function Reactions({
  reactions,
  meId,
  nameOf,
  onToggle,
  align = "start",
}: {
  reactions: ChatReaction[] | undefined;
  meId: string;
  nameOf: (id: string) => string;
  onToggle: (emoji: string, add: boolean) => void;
  align?: "start" | "end";
}) {
  if (!reactions || reactions.length === 0) return null;
  return (
    <div className={styles.reactions} data-align={align}>
      {reactions.map((r) => {
        const mine = r.userIds.includes(meId);
        const names = r.userIds.map((id) => (id === meId ? "Ty" : nameOf(id))).join(", ");
        return (
          <button
            key={r.emoji}
            type="button"
            className={styles.reaction}
            data-mine={mine}
            aria-pressed={mine}
            title={names}
            aria-label={`${r.emoji} ${r.userIds.length}: ${names}${mine ? " (kliknutím zrušíš)" : ""}`}
            onClick={() => onToggle(r.emoji, !mine)}
          >
            <span className={styles.reactionEmoji}>{r.emoji}</span>
            {r.userIds.length > 1 && <span>{r.userIds.length}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Citace zprávy, na kterou se odpovídá
// ---------------------------------------------------------------------------

export function ReplyQuote({
  target,
  align = "start",
}: {
  /** null = původní zpráva už není (smazaná nebo moc stará) */
  target: { id: string; authorName: string; snippet: string } | null;
  align?: "start" | "end";
}) {
  if (!target) {
    return (
      <div className={styles.quote} data-align={align} data-missing="true">
        <Icon name="reply" size={13} />
        <span className={styles.quoteText}>Původní zpráva už není k dispozici</span>
      </div>
    );
  }
  return (
    <button type="button" className={styles.quote} data-align={align} onClick={() => jumpToMessage(target.id)} title="Přejít na původní zprávu">
      <Icon name="reply" size={13} />
      <span className={styles.quoteText}>
        <strong>{target.authorName}:</strong> {target.snippet}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Pruh nad polem pro psaní: odpovídáš / upravuješ
// ---------------------------------------------------------------------------

export function ComposerContext({ mode, title, snippet, onCancel }: { mode: "reply" | "edit"; title: string; snippet: string; onCancel: () => void }) {
  return (
    <div className={styles.context} data-mode={mode}>
      <Icon name={mode === "reply" ? "reply" : "edit"} size={16} />
      <div className={styles.contextMain}>
        <span className={styles.contextTitle}>{title}</span>
        <span className={styles.contextSnippet}>{snippet}</span>
      </div>
      <button type="button" className={styles.contextClose} onClick={onCancel} aria-label={mode === "reply" ? "Zrušit odpověď" : "Zrušit úpravu"} title="Zrušit (Esc)">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Připnuté zprávy nahoře v chatu
// ---------------------------------------------------------------------------

export type PinnedItem = { id: string; authorName: string; snippet: string };

export function PinnedBar({ items, canUnpin, onUnpin }: { items: PinnedItem[]; canUnpin: boolean; onUnpin: (id: string) => void }) {
  const [index, setIndex] = useState(0);
  if (items.length === 0) return null;
  const i = index % items.length;
  const item = items[i];
  return (
    <div className={styles.pinned} role="region" aria-label="Připnuté zprávy">
      <Icon name="pushpin" size={16} />
      <button type="button" className={styles.pinnedMain} onClick={() => jumpToMessage(item.id)} title="Přejít na zprávu">
        <span className={styles.pinnedLabel}>
          Připnuto{items.length > 1 ? ` · ${i + 1} z ${items.length}` : ""}
        </span>
        <span className={styles.pinnedText}>
          <strong>{item.authorName}:</strong> {item.snippet}
        </span>
      </button>
      {items.length > 1 && (
        <button type="button" className={styles.pinnedBtn} onClick={() => setIndex(i + 1)} aria-label="Další připnutá zpráva" title="Další připnutá">
          <Icon name="chevronRight" size={16} />
        </button>
      )}
      {canUnpin && (
        <button type="button" className={styles.pinnedBtn} onClick={() => onUnpin(item.id)} aria-label="Odepnout zprávu" title="Odepnout">
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
