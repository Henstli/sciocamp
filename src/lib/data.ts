// Jediné místo, odkud stránky berou data. S nastaveným Supabase čte z databáze
// jako přihlášený uživatel (oprávnění hlídá RLS), jinak vrací ukázková data.

import "server-only";
import { isSupabase } from "./config";
import { DEMO_ACTIVITIES, DEMO_CLASSROOMS, DEMO_HOME, DEMO_USERS } from "./demo-data";
import { canTeach, isAdmin } from "./roles";
import { createClient } from "./supabase/server";
import type { Activity, ActivityKind, ClassroomContent, Role, Slot, User, Weekday } from "./types";

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
  teacher_id: string;
  room: string;
  meet_url: string | null;
  capacity: number | null;
  allowed_grades: number[] | null;
  tone: Activity["tone"];
  project_name: string | null;
  milestones_done: number;
  milestones_total: number;
  activity_slots: { weekday: number; starts_at: string; ends_at: string }[];
  enrollments: { student_id: string }[];
};

const ACTIVITY_COLUMNS =
  "id, slug, kind, title, teacher_id, room, meet_url, capacity, allowed_grades, tone, project_name, milestones_done, milestones_total, activity_slots(weekday, starts_at, ends_at), enrollments(student_id)";

function toActivity(r: ActivityRow): Activity {
  return {
    id: r.slug,
    kind: r.kind,
    title: r.title,
    teacherId: r.teacher_id,
    room: r.room,
    meetUrl: r.meet_url,
    allowedGrades: r.allowed_grades,
    slots: r.activity_slots
      .map((s): Slot => ({ day: s.weekday as Weekday, start: s.starts_at.slice(0, 5), end: s.ends_at.slice(0, 5) }))
      .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)),
    // RLS vrátí studentovi jen zápisy z jeho tříd — pro ostatní třídy je seznam prázdný.
    studentIds: r.enrollments.map((e) => e.student_id),
    capacity: r.capacity ?? undefined,
    tone: r.tone,
    project:
      r.project_name && r.milestones_total > 0
        ? { name: r.project_name, milestonesDone: r.milestones_done, milestonesTotal: r.milestones_total }
        : undefined,
  };
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`Nepodařilo se načíst ${what}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Uživatelé
// ---------------------------------------------------------------------------

export async function getUserById(id: string): Promise<User | null> {
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

export async function listUsers(): Promise<User[]> {
  if (!isSupabase) return DEMO_USERS;
  const sb = await createClient();
  const { data, error } = await sb.from("profiles").select(PROFILE_COLUMNS).order("full_name");
  if (error) fail("uživatele", error);
  return (data as ProfileRow[]).map(toUser);
}

export async function getUsersByIds(ids: string[]): Promise<User[]> {
  if (ids.length === 0) return [];
  if (!isSupabase) return ids.map((id) => DEMO_USERS.find((u) => u.id === id)).filter((u): u is User => !!u);
  const sb = await createClient();
  const { data, error } = await sb.from("profiles").select(PROFILE_COLUMNS).in("id", ids);
  if (error) fail("uživatele", error);
  const users = (data as ProfileRow[]).map(toUser);
  return ids.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
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

export async function listActivities(): Promise<Activity[]> {
  if (!isSupabase) return DEMO_ACTIVITIES;
  return fetchActivities();
}

export async function getActivity(id: string): Promise<Activity | null> {
  if (!isSupabase) return DEMO_ACTIVITIES.find((a) => a.id === id) ?? null;
  const sb = await createClient();
  const { data, error } = await sb.from("activities").select(ACTIVITY_COLUMNS).eq("slug", id).maybeSingle();
  if (error) fail("kurz", error);
  return data ? toActivity(data as unknown as ActivityRow) : null;
}

/** Aktivity, kterých se uživatel účastní jako student nebo je učí. */
export async function activitiesForUser(user: User, kind?: ActivityKind): Promise<Activity[]> {
  const all = await listActivities();
  return all.filter(
    (a) => (a.studentIds.includes(user.id) || a.teacherId === user.id) && (!kind || a.kind === kind),
  );
}

export async function activitiesTaughtBy(user: User): Promise<Activity[]> {
  return (await listActivities()).filter((a) => a.teacherId === user.id);
}

/** Kdo smí otevřít detail třídy: zapsaný student, vyučující a admin. */
export function canOpenActivity(user: User, activity: Activity): boolean {
  return isAdmin(user.role) || activity.teacherId === user.id || activity.studentIds.includes(user.id);
}

/** Smí měnit nastavení třídy (např. Meet): její vyučující a admin. */
export function teachesActivity(user: User, activity: Activity): boolean {
  return canTeach(user.role) && (activity.teacherId === user.id || isAdmin(user.role));
}

// ---------------------------------------------------------------------------
// Obsah tříd a Domov — nástěnka, úkoly a zprávy přijdou v etapách 2–4
// ---------------------------------------------------------------------------

const EMPTY_CLASSROOM: ClassroomContent = { stream: [], topics: [], teams: [], chat: [], upcoming: [] };

export async function getClassroom(activity: Activity): Promise<ClassroomContent> {
  if (isSupabase) return EMPTY_CLASSROOM;
  const content = DEMO_CLASSROOMS[activity.id];
  if (content) return content;
  return {
    ...EMPTY_CLASSROOM,
    stream: [
      {
        type: "post",
        id: `${activity.id}-welcome`,
        authorId: activity.teacherId,
        when: "1. 9.",
        label: "oznámení",
        text: `Vítejte v ${activity.kind === "atelier" ? "ateliéru" : "kurzu"} ${activity.title}! Odkaz na Meet najdete vpravo, platí pro celý blok.`,
        attachments: [],
        comments: 0,
      },
    ],
  };
}

/** Souhrn na Domov. Naostro zatím null — úkoly, hlasování a zprávy ještě nejsou. */
export async function getHomeSummary(): Promise<typeof DEMO_HOME | null> {
  return isSupabase ? null : DEMO_HOME;
}
