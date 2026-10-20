// Konzultace: čtení dat. Kdo co vidí, hlídá RLS (konzultace jen účastníci,
// obsazenost učitelů bez jmen přes consultation_board).

import "server-only";
import { cache } from "react";
import { isSupabase } from "./config";
import { addDays, parseIso, toIso, todayIso } from "./time";
import type { BusySpan, Consultation } from "./consultations";
import { createClient } from "./supabase/server";
import type { User } from "./types";

export type ConsultationRule = { teacherId: string; slot: string };
export type ConsultationBlock = { teacherId: string; day: string; slot: string | null };

const hm = (t: string) => t.slice(0, 5);

// ---------------------------------------------------------------------------
// Ukázkový režim: data podle nejbližších pátků (ať nestárnou)
// ---------------------------------------------------------------------------

function demoFridays(): string[] {
  const today = parseIso(todayIso())!;
  const out: string[] = [];
  for (let i = 1; out.length < 2; i++) {
    const d = addDays(today, i);
    if (new Date(Date.UTC(d.y, d.m - 1, d.d)).getUTCDay() === 5) out.push(toIso(d));
  }
  return out;
}

function demoConsultations(): Consultation[] {
  const [f1, f2] = demoFridays();
  return [
    { id: "k1", teacherId: "u-hankova", studentId: "u-liska", day: f1, start: "08:30", end: "09:00", meetUrl: "https://meet.google.com/abc-defg-hij", guestIds: [] },
    { id: "k2", teacherId: "u-jakubcova", studentId: "u-komarek", day: f1, start: "10:00", end: "10:15", meetUrl: null, guestIds: ["u-liska"] },
    { id: "k3", teacherId: "u-pietraszek", studentId: "u-kolarova", day: f1, start: "08:30", end: "09:00", meetUrl: null, guestIds: [] },
    { id: "k4", teacherId: "u-jakubcova", studentId: "u-cerny", day: f2, start: "11:00", end: "11:30", meetUrl: null, guestIds: [] },
  ];
}

const DEMO_RULES: ConsultationRule[] = [
  { teacherId: "u-jakubcova", slot: "08:30" },
  { teacherId: "u-jakubcova", slot: "08:45" },
  { teacherId: "u-pavel", slot: "11:30" },
  { teacherId: "u-pavel", slot: "11:45" },
];

function demoBlocks(): ConsultationBlock[] {
  const [, f2] = demoFridays();
  return [{ teacherId: "u-kumstat", day: f2, slot: null }];
}

// ---------------------------------------------------------------------------

/** Pravidelně nedostupné bloky všech učitelů. */
export const listConsultationRules = cache(async (): Promise<ConsultationRule[]> => {
  if (!isSupabase) return DEMO_RULES;
  const sb = await createClient();
  const { data } = await sb.from("consultation_rules").select("teacher_id, slot");
  return (data ?? []).map((r) => ({ teacherId: r.teacher_id as string, slot: hm(r.slot as string) }));
});

/** Jednorázově zrušené bloky / pátky v daných dnech. */
export async function listConsultationBlocks(days: string[]): Promise<ConsultationBlock[]> {
  if (!isSupabase) return demoBlocks().filter((b) => days.includes(b.day));
  if (days.length === 0) return [];
  const sb = await createClient();
  const { data } = await sb.from("consultation_blocks").select("teacher_id, day, slot").in("day", days);
  return (data ?? []).map((r) => ({ teacherId: r.teacher_id as string, day: r.day as string, slot: r.slot ? hm(r.slot as string) : null }));
}

/** Obsazené časy učitelů (jejich konzultace a pozvánky) — bez jmen studentů. */
export async function consultationBoard(from: string, to: string): Promise<BusySpan[]> {
  if (!isSupabase) {
    return demoConsultations()
      .filter((c) => c.day >= from && c.day <= to)
      .map((c) => ({ personId: c.teacherId, day: c.day, start: c.start, end: c.end }));
  }
  const sb = await createClient();
  const { data } = await sb.rpc("consultation_board", { d_from: from, d_to: to });
  return ((data ?? []) as { teacher_id: string; day: string; starts_at: string; ends_at: string }[]).map((r) => ({
    personId: r.teacher_id,
    day: r.day,
    start: hm(r.starts_at),
    end: hm(r.ends_at),
  }));
}

/** Konzultace, kterých se přihlášený účastní (učí, je zapsaný, nebo pozvaný), v rozmezí dnů. */
async function myConsultationsUncached(user: User, from: string, to: string): Promise<Consultation[]> {
  const involved = (c: Consultation) => c.teacherId === user.id || c.studentId === user.id || c.guestIds.includes(user.id);
  if (!isSupabase) return demoConsultations().filter((c) => c.day >= from && c.day <= to && involved(c));
  const sb = await createClient();
  const { data, error } = await sb
    .from("consultations")
    .select("id, teacher_id, student_id, day, starts_at, ends_at, meet_url, consultation_guests(user_id)")
    .gte("day", from)
    .lte("day", to)
    .order("day")
    .order("starts_at");
  if (error) throw new Error(`Nepodařilo se načíst konzultace: ${error.message}`);
  return (data ?? [])
    .map((r) => ({
      id: r.id as string,
      teacherId: r.teacher_id as string,
      studentId: r.student_id as string,
      day: r.day as string,
      start: hm(r.starts_at as string),
      end: hm(r.ends_at as string),
      meetUrl: (r.meet_url as string | null) ?? null,
      guestIds: ((r.consultation_guests as { user_id: string }[] | null) ?? []).map((g) => g.user_id),
    }))
    .filter(involved); // admin vidí v RLS všechny — tady jen ty jeho
}

export const myConsultations = cache(myConsultationsUncached);

