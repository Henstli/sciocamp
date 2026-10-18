// Jediné místo, odkud stránky berou data. S nastaveným Supabase čte z databáze
// jako přihlášený uživatel (oprávnění hlídá RLS), jinak vrací ukázková data.

import "server-only";
import { cache } from "react";
import { isSupabase } from "./config";
import { DEMO_ACTIVITIES, DEMO_CLASSROOMS, DEMO_HOME, DEMO_PERIODS, DEMO_USERS } from "./demo-data";
import { canTeach, isAdmin } from "./roles";
import { createClient } from "./supabase/server";
import type { Activity, ActivityKind, ClassroomContent, Period, Role, Slot, User, Weekday } from "./types";

// ---------------------------------------------------------------------------
// Převod řádků z databáze na typy aplikace
// ---------------------------------------------------------------------------

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  grade: number | null;
  staff_note: string | null;
  bio: string | null;
  activated: boolean;
  blocked: boolean;
};

const PROFILE_COLUMNS = "id, email, full_name, role, grade, staff_note, bio, activated, blocked";

export function toUser(r: ProfileRow): User {
  return {
    id: r.id,
    name: r.full_name || r.email.split("@")[0],
    email: r.email,
    role: r.role,
    grade: r.grade,
    group: r.role === "student" ? (r.grade ? `${r.grade}. ročník` : "Student") : r.staff_note || (r.role === "admin" ? "Vedení školy" : "Vyučující"),
    active: r.activated,
    bio: r.bio ?? undefined,
  };
}

type ActivityRow = {
  id: string;
  slug: string;
  kind: ActivityKind;
  title: string;
  description: string | null;
  teacher_id: string;
  location: string | null;
  starts_on: string | null;
  ends_on: string | null;
  blocks: { id: string; name: string; starts_on: string; ends_on: string } | null;
  meet_url: string | null;
  capacity: number | null;
  allowed_grades: number[] | null;
  tone: Activity["tone"];
  project_name: string | null;
  milestones_done: number;
  milestones_total: number;
  activity_slots: { weekday: number; starts_at: string; ends_at: string }[];
  enrollments: { student_id: string }[];
  activity_teachers: { teacher_id: string }[];
};

const ACTIVITY_COLUMNS =
  "id, slug, kind, title, description, teacher_id, location, starts_on, ends_on, blocks(id, name, starts_on, ends_on), meet_url, capacity, allowed_grades, tone, project_name, milestones_done, milestones_total, activity_slots(weekday, starts_at, ends_at), enrollments(student_id), activity_teachers(teacher_id)";

function toActivity(r: ActivityRow): Activity {
  return {
    id: r.slug,
    dbId: r.id,
    kind: r.kind,
    title: r.title,
    description: r.description ?? undefined,
    teacherId: r.teacher_id,
    location: r.location,
    period: r.blocks ? toPeriod(r.blocks) : null,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    meetUrl: r.meet_url,
    allowedGrades: r.allowed_grades,
    slots: r.activity_slots
      .map((s): Slot => ({ day: s.weekday as Weekday, start: s.starts_at.slice(0, 5), end: s.ends_at.slice(0, 5) }))
      .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)),
    // RLS vrátí studentovi jen zápisy z jeho tříd — pro ostatní třídy je seznam prázdný.
    studentIds: r.enrollments.map((e) => e.student_id),
    coTeacherIds: (r.activity_teachers ?? []).map((t) => t.teacher_id),
    capacity: r.capacity ?? undefined,
    tone: r.tone,
    project:
      r.project_name && r.milestones_total > 0
        ? { name: r.project_name, milestonesDone: r.milestones_done, milestonesTotal: r.milestones_total }
        : undefined,
  };
}

type PeriodRow = { id: string; name: string; starts_on: string; ends_on: string };

function toPeriod(r: PeriodRow): Period {
  return { id: r.id, name: r.name, startsOn: r.starts_on, endsOn: r.ends_on };
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`Nepodařilo se načíst ${what}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Uživatelé
// ---------------------------------------------------------------------------

async function getUserByIdUncached(id: string): Promise<User | null> {
  if (!isSupabase) return DEMO_USERS.find((u) => u.id === id) ?? null;
  const sb = await createClient();
  const { data, error } = await sb.from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
  if (error) fail("uživatele", error);
  return data ? toUser(data as ProfileRow) : null;
}

/** Profil přihlášeného uživatele včetně příznaku zablokování (jen pro auth.ts). */
export async function getOwnProfile(id: string): Promise<(User & { blocked: boolean }) | null> {
  const sb = await createClient();
  const { data, error } = await sb.from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return { ...toUser(data as ProfileRow), blocked: (data as ProfileRow).blocked };
}

/** Jen ukázkový režim (přihlášení e-mailem bez hesla). */
export async function getUserByEmail(email: string): Promise<User | null> {
  const e = email.trim().toLowerCase();
  return DEMO_USERS.find((u) => u.email === e) ?? null;
}

async function listUsersUncached(): Promise<User[]> {
  if (!isSupabase) return DEMO_USERS;
  const sb = await createClient();
  const { data, error } = await sb.from("profiles").select(PROFILE_COLUMNS).order("full_name");
  if (error) fail("uživatele", error);
  return (data as ProfileRow[]).map(toUser);
}

export async function getUsersByIds(ids: string[]): Promise<User[]> {
  if (ids.length === 0) return [];
  if (!isSupabase) return ids.map((id) => DEMO_USERS.find((u) => u.id === id)).filter((u): u is User => !!u);
  // Uživatelů je jen pár stovek: jeden (sdílený) seznam je rychlejší než další dotaz.
  const users = await listUsers();
  return ids.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
}

/** Vyučující a admini (kdo může učit kurz). */
export async function listStaff(): Promise<User[]> {
  return (await listUsers()).filter((u) => canTeach(u.role));
}

/** Všichni studenti, seřazení podle ročníku a jména. */
export async function listStudents(): Promise<User[]> {
  return (await listUsers())
    .filter((u) => u.role === "student")
    .sort((a, b) => (a.grade ?? 9) - (b.grade ?? 9) || a.name.localeCompare(b.name, "cs"));
}

/** Ukázkové účty pro přihlášení v demo režimu (jeden za každou roli). */
export async function listDemoAccounts(): Promise<User[]> {
  if (isSupabase) return [];
  return ["u-liska", "u-jakubcova", "u-pavel"].map((id) => DEMO_USERS.find((u) => u.id === id)!);
}

// ---------------------------------------------------------------------------
// Aktivity
// ---------------------------------------------------------------------------

async function fetchActivities() {
  const sb = await createClient();
  const { data, error } = await sb.from("activities").select(ACTIVITY_COLUMNS).order("title");
  if (error) fail("kurzy", error);
  return (data as unknown as ActivityRow[]).map(toActivity);
}

async function listActivitiesUncached(): Promise<Activity[]> {
  if (!isSupabase) return DEMO_ACTIVITIES;
  return fetchActivities();
}

async function getActivityUncached(id: string): Promise<Activity | null> {
  // Seznam aktivit se během požadavku stejně načítá (menu, rozvrh) — hledat v něm.
  return (await listActivities()).find((a) => a.id === id) ?? null;
}

/** Vyučuje člověk aktivitu (hlavní vyučující nebo spoluvyučující)? */
export function isTeacherOf(activity: Activity, userId: string): boolean {
  return activity.teacherId === userId || (activity.coTeacherIds ?? []).includes(userId);
}

/** Aktivity, kterých se uživatel účastní jako student nebo je učí. */
export async function activitiesForUser(user: User, kind?: ActivityKind): Promise<Activity[]> {
  const all = await listActivities();
  return all.filter(
    (a) => (a.studentIds.includes(user.id) || isTeacherOf(a, user.id)) && (!kind || a.kind === kind),
  );
}

export async function activitiesTaughtBy(user: User): Promise<Activity[]> {
  return (await listActivities()).filter((a) => isTeacherOf(a, user.id));
}

/** Kdo smí otevřít detail třídy: zapsaný student, vyučující a admin. */
export function canOpenActivity(user: User, activity: Activity): boolean {
  return isAdmin(user.role) || isTeacherOf(activity, user.id) || activity.studentIds.includes(user.id);
}

/** Smí měnit nastavení třídy (např. Meet): její vyučující a admin. */
export function teachesActivity(user: User, activity: Activity): boolean {
  return canTeach(user.role) && (isTeacherOf(activity, user.id) || isAdmin(user.role));
}

// ---------------------------------------------------------------------------
// Obsah tříd a Domov — nástěnka, úkoly a zprávy přijdou v etapách 2–4
// ---------------------------------------------------------------------------

const EMPTY_CLASSROOM: ClassroomContent = { topics: [], teams: [], upcoming: [] };

/** Týmy a další obsah třídy, který zatím žije jen v ukázkových datech. */
export async function getClassroom(activity: Activity): Promise<ClassroomContent> {
  if (isSupabase) return EMPTY_CLASSROOM;
  return DEMO_CLASSROOMS[activity.id] ?? EMPTY_CLASSROOM;
}

/** Souhrn na Domov. Naostro zatím null — úkoly, hlasování a zprávy ještě nejsou. */
export async function getHomeSummary(): Promise<typeof DEMO_HOME | null> {
  return isSupabase ? null : DEMO_HOME;
}

// ---------------------------------------------------------------------------
// Kurzová období
// ---------------------------------------------------------------------------

async function listPeriodsUncached(): Promise<Period[]> {
  if (!isSupabase) return DEMO_PERIODS;
  const sb = await createClient();
  const { data, error } = await sb.from("blocks").select("id, name, starts_on, ends_on").order("starts_on");
  if (error) fail("kurzová období", error);
  return (data as PeriodRow[]).map(toPeriod);
}

// Výsledky se v rámci jednoho požadavku sdílí (React cache) — stránka, menu
// i pomocné funkce se ptají na stejná data a do databáze se jde jen jednou.
export const listUsers = cache(listUsersUncached);
export const listActivities = cache(listActivitiesUncached);
export const getActivity = cache(getActivityUncached);
export const listPeriods = cache(listPeriodsUncached);
export const getUserById = cache(getUserByIdUncached);
