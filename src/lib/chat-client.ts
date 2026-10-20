"use client";

// Akce se zprávou přímo z prohlížeče (oprávnění hlídá RLS a RPC v databázi)
// a živé změny (úpravy, připnutí, smazání, reakce) přes Supabase Realtime.

import { useEffect, useRef } from "react";
import { CHAT_TABLE, chatError, type ChatKind } from "./chat";
import { createClient } from "./supabase/client";

type Result = { error?: string };

export async function setReaction(chat: ChatKind, messageId: string, emoji: string, add: boolean, userId: string): Promise<Result> {
  const sb = createClient();
  const { error } = add
    ? await sb.from("chat_reactions").insert({ chat, message_id: messageId, emoji })
    : await sb.from("chat_reactions").delete().match({ message_id: messageId, user_id: userId, emoji });
  // Stejná reakce už je uložená (dvojklik) — není to chyba.
  if (error && error.code !== "23505") return { error: chatError(error.message, "Reakci se nepodařilo uložit.") };
  return {};
}

export async function editChatMessage(chat: ChatKind, id: string, body: string): Promise<Result & { editedAt?: string }> {
  const { data, error } = await createClient().from(CHAT_TABLE[chat].table).update({ body }).eq("id", id).select("edited_at").maybeSingle();
  if (error || !data) return { error: "Zprávu se nepodařilo upravit." };
  return { editedAt: (data as { edited_at: string | null }).edited_at ?? new Date().toISOString() };
}

/** Smaže zprávu; v chatu zůstane „X zprávu smazal(a)“. */
export async function deleteChatMessage(chat: ChatKind, id: string): Promise<Result> {
  const { error } = await createClient().rpc("delete_chat_message", { chat, message: id });
  if (error) return { error: chatError(error.message, "Zprávu se nepodařilo smazat.") };
  return {};
}

export async function pinChatMessage(chat: ChatKind, id: string, pin: boolean): Promise<Result> {
  const { error } = await createClient().rpc("pin_chat_message", { chat, message: id, pin });
  if (error) return { error: chatError(error.message, pin ? "Zprávu se nepodařilo připnout." : "Zprávu se nepodařilo odepnout.") };
  return {};
}

export type LiveMessageUpdate = {
  id: string;
  body: string;
  editedAt: string | null;
  pinnedAt: string | null;
  pinnedBy: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
};

/** Změna zprávy (úprava, připnutí, smazání) promítnutá do zprávy v seznamu. */
export function applyUpdate<T extends { body: string; file: unknown; reactions?: unknown[] }>(m: T, u: LiveMessageUpdate): T {
  const deleted = !!u.deletedAt;
  return {
    ...m,
    body: u.body,
    editedAt: u.editedAt,
    pinnedAt: u.pinnedAt,
    pinnedBy: u.pinnedBy,
    deletedAt: u.deletedAt,
    deletedBy: u.deletedBy,
    ...(deleted ? { file: null, reactions: [] } : {}),
  };
}

/** Zpráva smazaná u mě (hned, než přijde potvrzení z Realtime). */
export function markDeleted<T extends { body: string; file: unknown }>(m: T, by: string): T {
  return { ...m, body: "", file: null, reactions: [], pinnedAt: null, pinnedBy: null, deletedAt: new Date().toISOString(), deletedBy: by };
}

/**
 * Živé změny v jednom chatu: úprava a připnutí zprávy, smazání zprávy,
 * přidání a odebrání reakce. Nové zprávy si chaty hlídají samy.
 */
export function useChatLive(
  chat: ChatKind,
  room: string | null | undefined,
  enabled: boolean,
  handlers: {
    onUpdate: (u: LiveMessageUpdate) => void;
    onDelete: (id: string) => void;
    onReaction: (messageId: string, emoji: string, userId: string, add: boolean) => void;
  },
) {
  // Obsluha se mění s každým vykreslením; kanál ale stačí navázat jednou na místnost.
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!enabled || !room) return;
    const { table, room: column } = CHAT_TABLE[chat];
    const sb = createClient();
    let cancelled = false;
    const channel = sb
      .channel(`akce-${chat}-${room}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table, filter: `${column}=eq.${room}` }, (payload) => {
        const r = payload.new as {
          id: string;
          body: string;
          edited_at: string | null;
          pinned_at: string | null;
          pinned_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
        };
        ref.current.onUpdate({
          id: r.id,
          body: r.body,
          editedAt: r.edited_at,
          pinnedAt: r.pinned_at,
          pinnedBy: r.pinned_by,
          deletedAt: r.deleted_at ?? null,
          deletedBy: r.deleted_by ?? null,
        });
      })
      // Smazání nejde filtrovat; přijde jen id a chat si ho najde (cizí id ignoruje).
      .on("postgres_changes", { event: "DELETE", schema: "public", table }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (id) ref.current.onDelete(id);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_reactions", filter: `room=eq.${room}` }, (payload) => {
        const r = payload.new as { message_id: string; user_id: string; emoji: string };
        ref.current.onReaction(r.message_id, r.emoji, r.user_id, true);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_reactions" }, (payload) => {
        const r = payload.old as { message_id?: string; user_id?: string; emoji?: string };
        if (r.message_id && r.user_id && r.emoji) ref.current.onReaction(r.message_id, r.emoji, r.user_id, false);
      });
    void sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) sb.realtime.setAuth(data.session.access_token);
      channel.subscribe();
    });
    return () => {
      cancelled = true;
      void sb.removeChannel(channel);
    };
  }, [chat, room, enabled]);
}
