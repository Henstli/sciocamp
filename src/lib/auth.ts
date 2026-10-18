import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getUserById } from "./data";
import { canTeach, isAdmin } from "./roles";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, readSessionToken } from "./session";
import type { User } from "./types";

/** Přihlášený uživatel, nebo null. Výsledek se v rámci jednoho požadavku cachuje. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const uid = await readSessionToken(token);
  if (!uid) return null;
  const user = await getUserById(uid);
  return user && user.active ? user : null;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/prihlaseni");
  return user;
}

/** Stránky pro výuku (učitel a admin). Ostatním se stránka tváří jako neexistující. */
export async function requireTeacher(): Promise<User> {
  const user = await requireUser();
  if (!canTeach(user.role)) notFound();
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!isAdmin(user.role)) notFound();
  return user;
}

export async function startSession(userId: string, remember: boolean) {
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { maxAge: SESSION_MAX_AGE } : {}),
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
