"use server";

import { redirect } from "next/navigation";
import { endSession, startSession } from "@/lib/auth";
import { getUserByEmail, getUserById, listDemoAccounts } from "@/lib/data";

export type LoginState = { error?: string; email?: string };

/** Ukázkový režim: přihlášení jedním z ukázkových účtů (náhrada za Google, dokud není OAuth). */
export async function loginAsDemo(formData: FormData) {
  const id = String(formData.get("userId") ?? "");
  const allowed = (await listDemoAccounts()).some((u) => u.id === id);
  const user = allowed ? await getUserById(id) : null;
  if (!user) redirect("/prihlaseni");
  await startSession(user.id, true);
  redirect("/");
}

/**
 * Ukázkový režim: přihlášení e-mailem z ukázkových dat. Heslo se zatím
 * nekontroluje — skutečné ověření převezme Supabase Auth.
 */
export async function loginWithEmail(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const remember = formData.get("remember") === "on";
  if (!email) return { error: "Vyplň školní e-mail." };
  const user = await getUserByEmail(email);
  if (!user) return { error: "Tenhle e-mail ve škole nemáme. Účty zakládá správce školy.", email };
  if (!user.active) return { error: "Účet ještě není aktivní. Přijmi pozvánku z e-mailu.", email };
  await startSession(user.id, remember);
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/prihlaseni");
}
