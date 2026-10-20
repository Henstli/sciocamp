"use client";

// Ankety z prohlížeče: založení, hlasování, ukončení a živé změny (Realtime).

import { useEffect, useRef } from "react";
import { chatError } from "./chat";
import { POLL_SELECT, toPoll, type PollRow, type PollVoteRow } from "./polls";
import { createClient } from "./supabase/client";
import type { ChatPoll } from "./types";

/** Založí anketu; vrací id zprávy a anketu (načtenou zpět z databáze). */
export async function createPoll(
  conversation: string,
  question: string,
  options: string[],
  multiple: boolean,
): Promise<{ error?: string; messageId?: string; poll?: ChatPoll; createdAt?: string }> {
  const sb = createClient();
  const { data, error } = await sb.rpc("create_chat_poll", { conversation, question, options, multiple });
  if (error || !data) return { error: chatError(error?.message, "Anketu se nepodařilo založit.") };
  const messageId = data as string;
  const [poll, msg] = await Promise.all([fetchPoll(messageId), sb.from("messages").select("created_at").eq("id", messageId).maybeSingle()]);
  return { messageId, poll: poll ?? undefined, createdAt: (msg.data as { created_at: string } | null)?.created_at };
}

/** Anketa ke zprávě i s hlasy. */
export async function fetchPoll(messageId: string): Promise<ChatPoll | null> {
  const sb = createClient();
  const { data } = await sb.from("chat_polls").select(POLL_SELECT).eq("message_id", messageId).maybeSingle();
  if (!data) return null;
  const row = data as PollRow;
  const { data: votes } = await sb.from("chat_poll_votes").select("option_id, user_id, poll_id").eq("poll_id", row.id);
  return toPoll(row, (votes ?? []) as PollVoteRow[]);
}

export async function votePoll(poll: string, choices: string[]): Promise<{ error?: string }> {
  const { error } = await createClient().rpc("vote_chat_poll", { poll, choices });
  return error ? { error: chatError(error.message, "Hlas se nepodařilo uložit.") } : {};
}

export async function closePoll(poll: string, closed: boolean): Promise<{ error?: string }> {
  const { error } = await createClient().rpc("close_chat_poll", { poll, closed });
  return error ? { error: chatError(error.message, closed ? "Anketu se nepodařilo ukončit." : "Anketu se nepodařilo otevřít.") } : {};
}

/** Živě: nové ankety ostatních, hlasy a ukončení v jedné konverzaci. */
export function usePollLive(
  conversation: string | null | undefined,
  enabled: boolean,
  handlers: {
    onPoll: (messageId: string, poll: ChatPoll) => void;
    onVote: (pollId: string | null, optionId: string, userId: string, add: boolean) => void;
    onClosed: (pollId: string, closedAt: string | null) => void;
  },
) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!enabled || !conversation) return;
    const sb = createClient();
    let cancelled = false;
    const channel = sb
      .channel(`ankety-${conversation}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_polls", filter: `conversation_id=eq.${conversation}` }, (payload) => {
        const r = payload.new as { message_id: string };
        void fetchPoll(r.message_id).then((p) => p && ref.current.onPoll(r.message_id, p));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_polls", filter: `conversation_id=eq.${conversation}` }, (payload) => {
        const r = payload.new as { id: string; closed_at: string | null };
        ref.current.onClosed(r.id, r.closed_at);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_poll_votes", filter: `conversation_id=eq.${conversation}` }, (payload) => {
        const r = payload.new as PollVoteRow;
        ref.current.onVote(r.poll_id, r.option_id, r.user_id, true);
      })
      // Smazání nejde filtrovat; přijde jen klíč (možnost + člověk).
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_poll_votes" }, (payload) => {
        const r = payload.old as { option_id?: string; user_id?: string };
        if (r.option_id && r.user_id) ref.current.onVote(null, r.option_id, r.user_id, false);
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
  }, [conversation, enabled]);
}
