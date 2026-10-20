"use server";

// Rozdělení na expedici: vyučující spravuje seznamy, studenti se přihlašují.
// Oprávnění hlídá databáze (RLS + RPC); tady jen kontrola vstupu a hlášky.

import { refresh } from "next/cache";
import { requireUser } from "../auth";
import { isSupabase } from "../config";
import { getActivity, teachesActivity } from "../data";
import { createClient } from "../supabase/server";
import { pragueLocalToIso } from "../time";

const DEMO = "Ukázkový režim: změny se neukládají.";

export type SignupResult = { error?: string; info?: string };

/** Hláška z databáze (naše RAISE jsou česky), jinak obecná. */
function dbError(error: { code?: string; message?: string } | null, fallback: string): SignupResult {
  if (!error) return {};
  if ((error.code === "42501" || error.code === "22023") && error.message) return { error: error.message };
  return { error: fallback };
}

export type BoardInput = {
  id?: string;
  title: string;
  description: string;
  maxPerStudent: number;
  required: boolean;
  showNames: boolean;
  /** Pražský čas „rrrr-mm-ddThh:mm“, prázdné = bez termínu, „neplatne“ = špatně vyplněné */
  closesAt: string;
  options: { id?: string; label: string; day: string | null; capacity: number | null }[];
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Založí nebo upraví seznam i s možnostmi (odebrané možnosti se smažou i s přihláškami). */
export async function saveBoard(activitySlug: string, input: BoardInput): Promise<SignupResult> {
  const user = await requireUser();
  const activity = await getActivity(activitySlug);
  if (!activity || !teachesActivity(user, activity)) return { error: "Rozdělení může upravovat jen vyučující třídy." };
  const title = input.title.trim();
  if (!title) return { error: "Napiš název (např. Pokoje)." };
  if (title.length > 80) return { error: "Název je moc dlouhý." };
  const options = input.options
    .map((o) => ({ ...o, label: o.label.trim() }))
    .filter((o) => o.label);
  if (options.length === 0) return { error: "Přidej aspoň jednu možnost." };
  if (options.length > 200) return { error: "Možností je moc (nejvýš 200)." };
  if (options.some((o) => o.label.length > 80)) return { error: "Název možnosti je moc dlouhý (nejvýš 80 znaků)." };
  if (options.some((o) => o.capacity !== null && (!Number.isInteger(o.capacity) || o.capacity < 1 || o.capacity > 500)))
    return { error: "Kapacita musí být celé číslo 1–500 (nebo prázdná = bez omezení)." };
  if (options.some((o) => o.day !== null && !DAY.test(o.day))) return { error: "Neplatný den u možnosti." };
  const max = Math.round(input.maxPerStudent);
  if (!(max >= 1 && max <= 50)) return { error: "Počet možností na studenta musí být 1–50." };
  let closesAt: string | null = null;
  if (input.closesAt === "neplatne") return { error: "Termín přihlašování není vyplněný správně." };
  if (input.closesAt) {
    closesAt = pragueLocalToIso(input.closesAt);
    if (!closesAt) return { error: "Termín přihlašování není vyplněný správně." };
  }
  if (!isSupabase || !activity.dbId) return { error: DEMO };

  const sb = await createClient();
  const fields = {
    title,
    description: input.description.trim().slice(0, 1000),
    max_per_student: max,
    required: !!input.required,
    show_names: !!input.showNames,
    closes_at: closesAt,
  };
  let boardId = input.id;
  if (boardId) {
    const { error } = await sb.from("signup_boards").update(fields).eq("id", boardId);
    if (error) return { error: "Seznam se nepodařilo uložit." };
    const { data: existing } = await sb.from("signup_options").select("id").eq("board_id", boardId);
    const keep = new Set(options.filter((o) => o.id).map((o) => o.id));
    const gone = (existing ?? []).map((o) => o.id as string).filter((id) => !keep.has(id));
    if (gone.length) {
      const { error: delErr } = await sb.from("signup_options").delete().in("id", gone);
      if (delErr) return { error: "Odebrané možnosti se nepodařilo smazat." };
    }
  } else {
    const { data, error } = await sb.from("signup_boards").insert({ ...fields, activity_id: activity.dbId }).select("id").single();
    if (error || !data) return { error: "Seznam se nepodařilo založit." };
    boardId = data.id as string;
  }
  for (const [i, o] of options.entries()) {
    const row = { label: o.label, day: o.day, capacity: o.capacity, position: i };
    const { error } = o.id
      ? await sb.from("signup_options").update(row).eq("id", o.id).eq("board_id", boardId)
      : await sb.from("signup_options").insert({ ...row, board_id: boardId });
    if (error) return { error: "Některou možnost se nepodařilo uložit." };
  }
  refresh();
  return { info: input.id ? "Uloženo." : "Seznam je zveřejněný, studenti dostali oznámení." };
}

export async function deleteBoard(boardId: string): Promise<SignupResult> {
  await requireUser();
  if (!isSupabase) return { error: DEMO };
  const sb = await createClient();
  const { data, error } = await sb.from("signup_boards").delete().eq("id", boardId).select("id");
  if (error || !data?.length) return { error: "Seznam se nepodařilo smazat." };
  refresh();
  return {};
}

export async function setBoardLocked(boardId: string, locked: boolean): Promise<SignupResult> {
  await requireUser();
  if (!isSupabase) return { error: DEMO };
  const sb = await createClient();
  const { data, error } = await sb.from("signup_boards").update({ locked }).eq("id", boardId).select("id");
  if (error || !data?.length) return { error: "Nepodařilo se to změnit." };
  refresh();
  return {};
}

async function rpc(name: string, args: Record<string, string>, fallback: string): Promise<SignupResult> {
  await requireUser();
  if (!isSupabase) return { error: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc(name, args);
  if (error) return dbError(error, fallback);
  refresh();
  return {};
}

export async function joinOption(optionId: string) {
  return rpc("signup_join", { option: optionId }, "Přihlásit se nepodařilo.");
}
export async function leaveOption(optionId: string) {
  return rpc("signup_leave", { option: optionId }, "Odhlásit se nepodařilo.");
}
export async function assignStudent(optionId: string, studentId: string) {
  return rpc("signup_assign", { option: optionId, student: studentId }, "Studenta se nepodařilo zapsat.");
}
export async function unassignStudent(optionId: string, studentId: string) {
  return rpc("signup_unassign", { option: optionId, student: studentId }, "Studenta se nepodařilo odebrat.");
}
