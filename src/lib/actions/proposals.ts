"use server";

// Návrhy a přání (Hlasování). Kdo smí co, hlídá databáze (RLS a funkce
// set_proposal_need, resolve_proposal, withdraw_proposal, reopen_proposal,
// fulfil_wish, close_wish, reopen_wish).

import { refresh } from "next/cache";
import { requireUser } from "../auth";
import { isSupabase } from "../config";
import { getActivity } from "../data";
import type { ProposalCategory, ProposalGoal, VoteChoice, WishKind } from "../proposals";
import { canTeach, isAdmin } from "../roles";
import { createClient } from "../supabase/server";

export type ActionResult = { error?: string; info?: string; ok?: boolean };
export type FormResult = ActionResult & { fieldErrors?: Record<string, string> };

const DEMO = "Ukázkový režim: změny se neukládají.";
const CATEGORIES: ProposalCategory[] = ["kurzy", "ateliery", "rozvrh", "online", "expedice", "komunita", "pravidla", "jine"];
const CHOICES: VoteChoice[] = ["pro", "jedno", "proti"];
const GOALS: ProposalGoal[] = ["shromazdeni", "schvaleni"];
const KINDS: WishKind[] = ["atelier", "expedice", "kurz"];

/** Chyby z databáze jsou česky — ukážeme je, technické nahradíme obecnou hláškou. */
function explain(message: string | undefined, fallback: string) {
  if (message && /[ěščřžýáíéůú]/i.test(message) && !/violates|permission|relation|column/i.test(message)) return message;
  return fallback;
}

async function run(fn: (sb: Awaited<ReturnType<typeof createClient>>) => PromiseLike<{ error: { message: string } | null }>, fallback: string) {
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await fn(sb);
  if (error) return { error: explain(error.message, fallback) };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Návrhy
// ---------------------------------------------------------------------------

export async function createProposal(_prev: FormResult, formData: FormData): Promise<FormResult> {
  await requireUser();
  const title = String(formData.get("title") ?? "").replace(/\s+/g, " ").trim();
  const body = String(formData.get("body") ?? "").trim();
  const category = String(formData.get("category") ?? "jine") as ProposalCategory;
  const goal = String(formData.get("goal") ?? "") as ProposalGoal;
  const need = Number(formData.get("needPercent"));
  const fieldErrors: Record<string, string> = {};
  if (title.length < 3) fieldErrors.title = "Napiš krátký název návrhu.";
  if (title.length > 120) fieldErrors.title = "Název je moc dlouhý (max. 120 znaků).";
  if (body.length > 4000) fieldErrors.body = "Popis je moc dlouhý.";
  if (!GOALS.includes(goal)) fieldErrors.goal = "Vyber, co se má s návrhem stát.";
  if (!Number.isInteger(need) || need < 1 || need > 100) fieldErrors.needPercent = "Napiš celé číslo 1 až 100.";
  if (Object.keys(fieldErrors).length) return { error: "Zkontroluj zvýrazněná pole.", fieldErrors };
  if (!isSupabase) return { info: DEMO };

  const sb = await createClient();
  const { error } = await sb.from("proposals").insert({
    title,
    body,
    category: CATEGORIES.includes(category) ? category : "jine",
    goal,
    need_percent_proposed: need,
  });
  if (error) return { error: "Návrh se nepodařilo zveřejnit." };
  refresh();
  return { ok: true, info: "Návrh je zveřejněný. Vyučující teď potvrdí práh." };
}

/** Hlas k návrhu: pro / je mi to jedno / proti; null = hlas zrušit. */
export async function voteProposal(id: string, choice: VoteChoice | null): Promise<ActionResult> {
  const user = await requireUser();
  if (choice !== null && !CHOICES.includes(choice)) return { error: "Neznámá volba." };
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { data: mine } = await sb.from("proposal_supports").select("choice").eq("proposal_id", id).eq("user_id", user.id).maybeSingle();
  const { error } =
    choice === null
      ? await sb.from("proposal_supports").delete().eq("proposal_id", id).eq("user_id", user.id)
      : mine
        ? await sb.from("proposal_supports").update({ choice }).eq("proposal_id", id).eq("user_id", user.id)
        : await sb.from("proposal_supports").insert({ proposal_id: id, choice });
  if (error) return { error: "Hlas se nepodařilo uložit (návrh je možná uzavřený)." };
  refresh();
  return { ok: true };
}

export async function addProposalComment(id: string, body: string): Promise<ActionResult> {
  await requireUser();
  const text = body.trim();
  if (!text) return { error: "Napiš komentář." };
  if (text.length > 2000) return { error: "Komentář je moc dlouhý." };
  return run((sb) => sb.from("proposal_comments").insert({ proposal_id: id, body: text }), "Komentář se nepodařilo přidat.");
}

export async function deleteProposalComment(commentId: string): Promise<ActionResult> {
  await requireUser();
  return run((sb) => sb.from("proposal_comments").delete().eq("id", commentId), "Komentář se nepodařilo smazat.");
}

export async function setProposalNeed(id: string, need: number): Promise<ActionResult> {
  const user = await requireUser();
  if (!canTeach(user.role)) return { error: "Práh potvrzuje vyučující nebo admin." };
  if (!Number.isInteger(need) || need < 1 || need > 100) return { error: "Napiš celé číslo 1 až 100." };
  return run((sb) => sb.rpc("set_proposal_need", { proposal: id, n: need }), "Práh se nepodařilo uložit.");
}

export async function resolveProposal(id: string, result: "projednano" | "schvaleno" | "zamitnuto", note: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!canTeach(user.role)) return { error: "O návrhu rozhoduje vyučující nebo admin." };
  if (!note.trim()) return { error: result === "projednano" ? "Napiš závěr ze shromáždění." : "Napiš zdůvodnění." };
  return run((sb) => sb.rpc("resolve_proposal", { proposal: id, result, note: note.trim() }), "Rozhodnutí se nepodařilo uložit.");
}

export async function withdrawProposal(id: string): Promise<ActionResult> {
  await requireUser();
  return run((sb) => sb.rpc("withdraw_proposal", { proposal: id }), "Návrh se nepodařilo stáhnout.");
}

export async function reopenProposal(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!canTeach(user.role)) return { error: "Jen vyučující nebo admin." };
  return run((sb) => sb.rpc("reopen_proposal", { proposal: id }), "Návrh se nepodařilo znovu otevřít.");
}

/**
 * Admin smaže návrh. Uzavřený (z historie) jen s potvrzením, že byl
 * uskutečněn nebo řádně zapsán; otevřený jen kvůli nevhodnému obsahu.
 */
export async function deleteProposal(id: string, doneConfirmed: boolean): Promise<ActionResult> {
  const user = await requireUser();
  if (!isAdmin(user.role)) return { error: "Návrhy maže jen admin." };
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { data: p } = await sb.from("proposals").select("status").eq("id", id).maybeSingle();
  if (!p) return { error: "Návrh už neexistuje." };
  if (p.status !== "open" && !doneConfirmed) return { error: "Nejdřív potvrď, že byl návrh uskutečněn nebo řádně zapsán." };
  const { data, error } = await sb.from("proposals").delete().eq("id", id).select("id");
  if (error || !data?.length) return { error: "Návrh se nepodařilo smazat." };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Hlasování (přání)
// ---------------------------------------------------------------------------

export async function createWish(_prev: FormResult, formData: FormData): Promise<FormResult> {
  await requireUser();
  const kind = String(formData.get("kind") ?? "") as WishKind;
  const title = String(formData.get("title") ?? "").replace(/\s+/g, " ").trim();
  const body = String(formData.get("body") ?? "").trim();
  const fieldErrors: Record<string, string> = {};
  if (!KINDS.includes(kind)) fieldErrors.kind = "Vyber, co by to mělo být.";
  if (title.length < 3) fieldErrors.title = "Napiš, co by ses chtěl(a) učit.";
  if (title.length > 120) fieldErrors.title = "Název je moc dlouhý (max. 120 znaků).";
  if (body.length > 2000) fieldErrors.body = "Popis je moc dlouhý.";
  if (Object.keys(fieldErrors).length) return { error: "Zkontroluj zvýrazněná pole.", fieldErrors };
  if (!isSupabase) return { info: DEMO };

  const sb = await createClient();
  const { error } = await sb.from("wishes").insert({ kind, title, body });
  if (error) return { error: "Přání se nepodařilo přidat." };
  refresh();
  return { ok: true, info: "Přání je přidané." };
}

export async function toggleWishVote(id: string, on: boolean): Promise<ActionResult> {
  const user = await requireUser();
  return run(
    (sb) =>
      on
        ? sb.from("wish_votes").insert({ wish_id: id })
        : sb.from("wish_votes").delete().eq("wish_id", id).eq("user_id", user.id),
    "Hlas se nepodařilo uložit (přání je možná uzavřené).",
  );
}

export async function deleteWish(id: string): Promise<ActionResult> {
  await requireUser();
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { data, error } = await sb.from("wishes").delete().eq("id", id).select("id");
  if (error || !data?.length) return { error: "Smazat jde jen vlastní přání, které zatím nikdo další nechce." };
  refresh();
  return { ok: true };
}

/** Vyučující propojí přání s aktivitou (podle slugu) → „Vypsáno“. */
export async function fulfilWish(id: string, activitySlug: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!canTeach(user.role)) return { error: "Přání vypisuje vyučující nebo admin." };
  const activity = await getActivity(activitySlug);
  if (!activity) return { error: "Vyber aktivitu." };
  if (!isSupabase) return { info: DEMO };
  return run((sb) => sb.rpc("fulfil_wish", { wish: id, activity: activity.dbId }), "Přání se nepodařilo vypsat.");
}

export async function closeWish(id: string, reason: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!canTeach(user.role)) return { error: "Přání uzavírá vyučující nebo admin." };
  if (!reason.trim()) return { error: "Napiš zdůvodnění." };
  return run((sb) => sb.rpc("close_wish", { wish: id, reason: reason.trim() }), "Přání se nepodařilo uzavřít.");
}

export async function reopenWish(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!canTeach(user.role)) return { error: "Jen vyučující nebo admin." };
  return run((sb) => sb.rpc("reopen_wish", { wish: id }), "Přání se nepodařilo vrátit.");
}
