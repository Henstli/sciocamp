// Společné pro všechny chaty (Zprávy, chat třídy, týmový chat): odpovědi,
// úpravy, připnutí a reakce. Bez závislosti na serveru i prohlížeči.

import { isGifUrl } from "@/components/composer/gif";
import { mentionPlain } from "./mentions";
import type { ChatReaction } from "./types";

/** Druh chatu tak, jak ho zná databáze (`chat_reactions.chat`, `pin_chat_message`). */
export type ChatKind = "zpravy" | "trida" | "tym";

/** Tabulka a sloupec místnosti pro každý druh chatu. */
export const CHAT_TABLE: Record<ChatKind, { table: string; room: string }> = {
  zpravy: { table: "messages", room: "conversation_id" },
  trida: { table: "class_messages", room: "activity_id" },
  tym: { table: "team_messages", room: "team_id" },
};

/** Sloupce zprávy navíc (odpověď, úprava, připnutí). */
export const CHAT_META_COLUMNS = "reply_to, edited_at, pinned_at, pinned_by";

/** Čtyři rychlé reakce; další emoji jdou vybrat z celého seznamu. */
export const QUICK_REACTIONS = ["❤️", "👍", "👎", "😂"] as const;

export type ReactionRow = { message_id: string; user_id: string; emoji: string; created_at?: string };

/** Řádky z `chat_reactions` → reakce u každé zprávy (pořadí podle první reakce). */
export function groupReactions(rows: ReactionRow[]): Map<string, ChatReaction[]> {
  const sorted = [...rows].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  const out = new Map<string, ChatReaction[]>();
  for (const r of sorted) {
    const list = out.get(r.message_id) ?? [];
    const hit = list.find((x) => x.emoji === r.emoji);
    if (hit) {
      if (!hit.userIds.includes(r.user_id)) hit.userIds.push(r.user_id);
    } else list.push({ emoji: r.emoji, userIds: [r.user_id] });
    out.set(r.message_id, list);
  }
  return out;
}

/** Přidá nebo odebere reakci člověka (bez duplicit — Realtime může přijít i po vlastní změně). */
export function applyReaction(list: ChatReaction[] | undefined, emoji: string, userId: string, add: boolean): ChatReaction[] {
  const current = list ?? [];
  if (add) {
    const hit = current.find((x) => x.emoji === emoji);
    if (hit?.userIds.includes(userId)) return current;
    return hit ? current.map((x) => (x.emoji === emoji ? { ...x, userIds: [...x.userIds, userId] } : x)) : [...current, { emoji, userIds: [userId] }];
  }
  return current
    .map((x) => (x.emoji === emoji ? { ...x, userIds: x.userIds.filter((u) => u !== userId) } : x))
    .filter((x) => x.userIds.length > 0);
}

/** Krátký náhled zprávy do citace odpovědi a připnuté lišty. */
export function messageSnippet(body: string, fileName?: string | null, max = 90): string {
  if (body && isGifUrl(body)) return "GIF";
  const text = mentionPlain(body).replace(/\s+/g, " ").trim();
  if (!text) return fileName ? `Příloha: ${fileName}` : "Příloha";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Text zprávy k úpravě: zmínky „@[Jméno](id)“ jako „@Jméno“ (při uložení se znovu označí). */
export const editableText = (body: string) => mentionPlain(body);

/** Chybová hláška z databáze pro člověka. */
export function chatError(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  if (/[áčďéěíňóřšťúůýž]/i.test(message) && !/violates|permission|policy/i.test(message)) return message;
  return fallback;
}
