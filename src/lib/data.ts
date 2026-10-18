// Jediné místo, odkud stránky berou data. Funkce jsou async, aby se v další
// fázi daly beze změny stránek přepsat na dotazy do Supabase.

import "server-only";
import { DEMO_ACTIVITIES, DEMO_CLASSROOMS, DEMO_HOME, DEMO_USERS } from "./demo-data";
import type { Activity, ActivityKind, ClassroomContent, User } from "./types";
import { canTeach, isAdmin } from "./roles";

export async function getUserById(id: string): Promise<User | null> {
  return DEMO_USERS.find((u) => u.id === id) ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const e = email.trim().toLowerCase();
  return DEMO_USERS.find((u) => u.email === e) ?? null;
}

export async function listUsers(): Promise<User[]> {
  return DEMO_USERS;
}

export async function getUsersByIds(ids: string[]): Promise<User[]> {
  return ids.map((id) => DEMO_USERS.find((u) => u.id === id)).filter((u): u is User => !!u);
}

/** Ukázkové účty pro přihlášení v demo režimu (jeden za každou roli). */
export async function listDemoAccounts(): Promise<User[]> {
  return ["u-liska", "u-jakubcova", "u-pavel"].map((id) => DEMO_USERS.find((u) => u.id === id)!);
}

export async function listActivities(): Promise<Activity[]> {
  return DEMO_ACTIVITIES;
}

export async function getActivity(id: string): Promise<Activity | null> {
  return DEMO_ACTIVITIES.find((a) => a.id === id) ?? null;
}

/** Aktivity, kterých se uživatel účastní jako student nebo je učí. */
export async function activitiesForUser(user: User, kind?: ActivityKind): Promise<Activity[]> {
  return DEMO_ACTIVITIES.filter(
    (a) => (a.studentIds.includes(user.id) || a.teacherId === user.id) && (!kind || a.kind === kind),
  );
}

export async function activitiesTaughtBy(user: User): Promise<Activity[]> {
  return DEMO_ACTIVITIES.filter((a) => a.teacherId === user.id);
}

/** Kdo smí otevřít detail třídy: zapsaný student, vyučující a admin. */
export function canOpenActivity(user: User, activity: Activity): boolean {
  return isAdmin(user.role) || activity.teacherId === user.id || activity.studentIds.includes(user.id);
}

export function teachesActivity(user: User, activity: Activity): boolean {
  return canTeach(user.role) && (activity.teacherId === user.id || isAdmin(user.role));
}

export async function getClassroom(activity: Activity): Promise<ClassroomContent> {
  const content = DEMO_CLASSROOMS[activity.id];
  if (content) return content;
  return {
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
    topics: [],
    teams: [],
    chat: [],
    upcoming: [],
  };
}

export async function getHomeSummary() {
  return DEMO_HOME;
}
