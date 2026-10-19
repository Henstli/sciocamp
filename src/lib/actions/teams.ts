"use server";

// Studenti se do týmů rozdělují sami (úkoly s team_mode = 'students').
// Pravidla (třída, plný tým, jeden tým na úkol) hlídají funkce v databázi.

import { refresh } from "next/cache";
import { requireUser } from "../auth";
import { isSupabase } from "../config";
import { createClient } from "../supabase/server";

const DEMO = "Ukázkový režim: týmy se neukládají.";

function explain(message: string | undefined, fallback: string) {
  if (!message) return fallback;
  if (/plný|Už jsi v týmu|rozděluje vyučující|ohodnocený|nepatříš/.test(message)) return message;
  return fallback;
}

export async function createOwnTeam(assignmentId: string, name: string): Promise<{ error?: string; info?: string }> {
  await requireUser();
  const teamName = name.trim().slice(0, 80);
  if (!teamName) return { error: "Napiš název týmu." };
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc("create_own_team", { assignment: assignmentId, team_name: teamName });
  if (error) return { error: explain(error.message, "Tým se nepodařilo založit.") };
  refresh();
  return {};
}

export async function joinTeam(teamId: string): Promise<{ error?: string; info?: string }> {
  await requireUser();
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc("join_team", { team: teamId });
  if (error) return { error: explain(error.message, "Do týmu se nepodařilo přidat.") };
  refresh();
  return {};
}

export async function leaveTeam(teamId: string): Promise<{ error?: string; info?: string }> {
  await requireUser();
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc("leave_team", { team: teamId });
  if (error) return { error: explain(error.message, "Z týmu se nepodařilo odejít.") };
  refresh();
  return {};
}
