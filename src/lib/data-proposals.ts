// Návrhy a přání (Hlasování): čtení dat. Oprávnění hlídá RLS.

import "server-only";
import { cache } from "react";
import { isSupabase } from "./config";
import { DEMO_USERS } from "./demo-data";
import { DEMO_PROPOSAL_COMMENTS, DEMO_PROPOSALS, DEMO_WISHES } from "./demo-proposals";
import { wishExpired, type Proposal, type ProposalComment, type VoteChoice, type Wish } from "./proposals";
import { createClient } from "./supabase/server";
import { nowMs } from "./time";
import type { User } from "./types";

const PROPOSAL_COLUMNS =
  "id, author_id, title, body, category, goal, need_percent_proposed, need_percent, status, resolution, resolved_by, resolved_at, pro_count, against_count, neutral_count, reached_at, created_at, voting_ends_at";

type ProposalRow = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  category: Proposal["category"];
  goal: Proposal["goal"];
  need_percent_proposed: number;
  need_percent: number | null;
  status: Proposal["status"];
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  pro_count: number;
  against_count: number;
  neutral_count: number;
  reached_at: string | null;
  created_at: string;
  voting_ends_at: string;
};

function toProposal(r: ProposalRow, commentCount: number, myChoice: VoteChoice | null): Proposal {
  return {
    id: r.id,
    authorId: r.author_id,
    title: r.title,
    body: r.body,
    category: r.category,
    goal: r.goal,
    needPercentProposed: r.need_percent_proposed,
    needPercent: r.need_percent,
    status: r.status,
    resolution: r.resolution,
    resolvedBy: r.resolved_by,
    resolvedAt: r.resolved_at,
    proCount: r.pro_count,
    againstCount: r.against_count,
    neutralCount: r.neutral_count,
    reachedAt: r.reached_at,
    createdAt: r.created_at,
    votingEndsAt: r.voting_ends_at,
    commentCount,
    myChoice,
  };
}

function demoProposal(p: (typeof DEMO_PROPOSALS)[number], user: User): Proposal {
  const { votes, ...rest } = p;
  const all = Object.values(votes);
  return {
    ...rest,
    proCount: all.filter((v) => v === "pro").length,
    againstCount: all.filter((v) => v === "proti").length,
    neutralCount: all.filter((v) => v === "jedno").length,
    myChoice: votes[user.id] ?? null,
    commentCount: DEMO_PROPOSAL_COMMENTS[p.id]?.length ?? 0,
  };
}

/** Uzavře návrhy, kterým skončilo hlasování bez dost hlasů pro (spouští se při otevření Návrhů). */
export async function closeExpiredProposals(): Promise<void> {
  if (!isSupabase) return;
  const sb = await createClient();
  await sb.rpc("close_expired_proposals");
}

/** Kolik lidí ve škole může hlasovat (základ pro procenta). */
async function memberCountUncached(): Promise<number> {
  if (!isSupabase) return DEMO_USERS.length;
  const sb = await createClient();
  const { data } = await sb.rpc("member_count");
  return (data as number | null) ?? 0;
}

export const memberCount = cache(memberCountUncached);

/** Všechny návrhy, nejnovější první. */
async function listProposalsUncached(user: User): Promise<Proposal[]> {
  if (!isSupabase) return DEMO_PROPOSALS.map((p) => demoProposal(p, user)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sb = await createClient();
  const [rows, mine, comments] = await Promise.all([
    sb.from("proposals").select(PROPOSAL_COLUMNS).order("created_at", { ascending: false }),
    // Hlasy jsou anonymní — RLS vrátí jen ty moje.
    sb.from("proposal_supports").select("proposal_id, choice").eq("user_id", user.id),
    sb.from("proposal_comments").select("proposal_id"),
  ]);
  if (rows.error) throw new Error(`Nepodařilo se načíst návrhy: ${rows.error.message}`);
  const choice = new Map((mine.data ?? []).map((r) => [r.proposal_id as string, r.choice as VoteChoice]));
  const counts = new Map<string, number>();
  for (const c of comments.data ?? []) counts.set(c.proposal_id as string, (counts.get(c.proposal_id as string) ?? 0) + 1);
  return (rows.data as ProposalRow[]).map((r) => toProposal(r, counts.get(r.id) ?? 0, choice.get(r.id) ?? null));
}

export const listProposals = cache(listProposalsUncached);

/** Jeden návrh s komentáři. */
export async function getProposal(user: User, id: string): Promise<{ proposal: Proposal; comments: ProposalComment[] } | null> {
  if (!isSupabase) {
    const p = DEMO_PROPOSALS.find((x) => x.id === id);
    if (!p) return null;
    return { proposal: demoProposal(p, user), comments: DEMO_PROPOSAL_COMMENTS[id] ?? [] };
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await createClient();
  const [row, comments, mine] = await Promise.all([
    sb.from("proposals").select(PROPOSAL_COLUMNS).eq("id", id).maybeSingle(),
    sb.from("proposal_comments").select("id, author_id, body, created_at").eq("proposal_id", id).order("created_at"),
    sb.from("proposal_supports").select("choice").eq("proposal_id", id).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!row.data) return null;
  return {
    proposal: toProposal(row.data as ProposalRow, comments.data?.length ?? 0, (mine.data?.choice as VoteChoice | undefined) ?? null),
    comments: (comments.data ?? []).map((c) => ({
      id: c.id as string,
      authorId: c.author_id as string,
      body: c.body as string,
      createdAt: c.created_at as string,
    })),
  };
}

const WISH_COLUMNS = "id, author_id, kind, title, body, status, activity_id, note, closed_at, vote_count, created_at";

/** Všechna platná přání (prošlá bez vypsání se nezobrazují), nejžádanější první. */
async function listWishesUncached(user: User): Promise<Wish[]> {
  const now = nowMs();
  return (await readWishes(user)).filter((w) => !wishExpired(w, now));
}

async function readWishes(user: User): Promise<Wish[]> {
  if (!isSupabase) {
    return DEMO_WISHES.map(({ voters, ...w }) => ({ ...w, voteCount: voters.length, voted: voters.includes(user.id) })).sort(
      (a, b) => b.voteCount - a.voteCount || b.createdAt.localeCompare(a.createdAt),
    );
  }
  const sb = await createClient();
  const [rows, mine] = await Promise.all([
    sb.from("wishes").select(WISH_COLUMNS).order("vote_count", { ascending: false }).order("created_at", { ascending: false }),
    sb.from("wish_votes").select("wish_id").eq("user_id", user.id),
  ]);
  if (rows.error) throw new Error(`Nepodařilo se načíst přání: ${rows.error.message}`);
  const voted = new Set((mine.data ?? []).map((r) => r.wish_id as string));
  return (rows.data ?? []).map((r) => ({
    id: r.id as string,
    authorId: r.author_id as string,
    kind: r.kind as Wish["kind"],
    title: r.title as string,
    body: r.body as string,
    status: r.status as Wish["status"],
    activityId: r.activity_id as string | null,
    note: r.note as string | null,
    closedAt: r.closed_at as string | null,
    voteCount: r.vote_count as number,
    createdAt: r.created_at as string,
    voted: voted.has(r.id as string),
  }));
}

export const listWishes = cache(listWishesUncached);

/** Jedno přání (pro vypsání aktivitou). */
export async function getWish(user: User, id: string): Promise<Wish | null> {
  return (await listWishes(user)).find((w) => w.id === id) ?? null;
}

/** Smaže z databáze nevypsaná přání starší 14 dní. */
export async function purgeExpiredWishes(): Promise<void> {
  if (!isSupabase) return;
  const sb = await createClient();
  await sb.rpc("purge_expired_wishes");
}

/** Počet otevřených přání, u kterých přihlášený ještě nehlasoval (odznak v menu). */
export async function wishesWaiting(user: User): Promise<number> {
  const wishes = await listWishes(user);
  return wishes.filter((w) => w.status === "open" && !w.voted).length;
}
