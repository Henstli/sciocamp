// Ankety ve skupinových chatech: převod řádků z databáze a výpočty pro zobrazení.

import type { ChatPoll } from "./types";

export const POLL_SELECT = "id, message_id, question, multiple, closed_at, author_id, chat_poll_options(id, label, position)";

export type PollRow = {
  id: string;
  message_id: string;
  question: string;
  multiple: boolean;
  closed_at: string | null;
  author_id: string;
  chat_poll_options: { id: string; label: string; position: number }[];
};
export type PollVoteRow = { option_id: string; user_id: string; poll_id: string };

export function toPoll(r: PollRow, votes: PollVoteRow[]): ChatPoll {
  return {
    id: r.id,
    question: r.question,
    multiple: r.multiple,
    closedAt: r.closed_at,
    authorId: r.author_id,
    options: [...r.chat_poll_options]
      .sort((a, b) => a.position - b.position)
      .map((o) => ({ id: o.id, label: o.label, voterIds: votes.filter((v) => v.option_id === o.id).map((v) => v.user_id) })),
  };
}

/** Kolik lidí v anketě hlasovalo (u více odpovědí každý jen jednou). */
export function pollVoterCount(p: ChatPoll): number {
  return new Set(p.options.flatMap((o) => o.voterIds)).size;
}

/** Moje vybrané možnosti. */
export function myChoices(p: ChatPoll, me: string): string[] {
  return p.options.filter((o) => o.voterIds.includes(me)).map((o) => o.id);
}

/** Nastaví moje hlasy na `choices` (bez duplicit). */
export function setMyVotes(p: ChatPoll, me: string, choices: string[]): ChatPoll {
  return {
    ...p,
    options: p.options.map((o) => {
      const rest = o.voterIds.filter((u) => u !== me);
      return { ...o, voterIds: choices.includes(o.id) ? [...rest, me] : rest };
    }),
  };
}

/** Jeden hlas přidaný / odebraný (Realtime). */
export function applyVote(p: ChatPoll, optionId: string, userId: string, add: boolean): ChatPoll {
  return {
    ...p,
    options: p.options.map((o) => {
      if (o.id !== optionId) return o;
      const has = o.voterIds.includes(userId);
      if (add) return has ? o : { ...o, voterIds: [...o.voterIds, userId] };
      return { ...o, voterIds: o.voterIds.filter((u) => u !== userId) };
    }),
  };
}
