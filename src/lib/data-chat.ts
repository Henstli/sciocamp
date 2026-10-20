// Odpovědi, úpravy, připnutí a reakce ke zprávám načteným na serveru
// (Zprávy, chat třídy, týmový chat).

import "server-only";
import { groupReactions, type ChatKind, type ReactionRow } from "./chat";
import { createClient } from "./supabase/server";
import type { ChatMeta } from "./types";

export type MetaRow = {
  id: string;
  reply_to?: string | null;
  edited_at?: string | null;
  pinned_at?: string | null;
  pinned_by?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

/** Reakce v místnosti a převod řádku zprávy na `ChatMeta`. */
export async function chatMetaFor(chat: ChatKind, room: string): Promise<(r: MetaRow) => ChatMeta> {
  const sb = await createClient();
  const { data } = await sb.from("chat_reactions").select("message_id, user_id, emoji, created_at").eq("chat", chat).eq("room", room);
  const reactions = groupReactions((data ?? []) as ReactionRow[]);
  return (r) => ({
    replyTo: r.reply_to ?? null,
    editedAt: r.edited_at ?? null,
    pinnedAt: r.pinned_at ?? null,
    pinnedBy: r.pinned_by ?? null,
    reactions: reactions.get(r.id) ?? [],
    deletedAt: r.deleted_at ?? null,
    deletedBy: r.deleted_by ?? null,
  });
}
