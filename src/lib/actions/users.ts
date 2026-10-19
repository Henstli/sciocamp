"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "../auth";
import { SCHOOL_DOMAIN, isSchoolEmail, isSupabase } from "../config";
import { siteUrl } from "../site";
import { createAdminClient } from "../supabase/server";
import type { Role } from "../types";

export type InviteState = { error?: string; info?: string };

const ROLES: Role[] = ["student", "ucitel", "admin"];

/** Admin založí účet a pošle pozvánku e-mailem. Heslo si uživatel nastaví sám. */
export async function inviteUser(_prev: InviteState, formData: FormData): Promise<InviteState> {
  await requireAdmin();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "student") as Role;
  const gradeRaw = String(formData.get("grade") ?? "");
  const staffNote = String(formData.get("staffNote") ?? "").trim() || null;

  if (fullName.length < 3) return { error: "Vyplň celé jméno." };
  if (!isSchoolEmail(email)) return { error: `E-mail musí končit na @${SCHOOL_DOMAIN}.` };
  if (!ROLES.includes(role)) return { error: "Neznámá role." };
  const grade = role === "student" ? Number(gradeRaw) : null;
  if (role === "student" && !(grade && grade >= 1 && grade <= 4)) return { error: "U studenta vyber ročník." };

  if (!isSupabase) return { info: `Ukázkový režim: pozvánka pro ${email} se neodešle.` };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    // Výchozí e-mail Supabase pošle přihlašovací údaje za „#“ — zpracuje je /auth/prijeti.
    redirectTo: `${await siteUrl()}/auth/prijeti`,
  });
  if (error || !data.user) {
    return {
      error:
        error?.code === "email_exists"
          ? "Uživatel s tímto e-mailem už existuje."
          : `Pozvánku se nepodařilo odeslat${error?.message ? `: ${error.message}` : "."}`,
    };
  }
  // Profil založil databázový trigger jako studenta; doplníme roli a ročník.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: fullName, role, grade, staff_note: role === "student" ? null : staffNote })
    .eq("id", data.user.id);
  if (profileError) return { error: `Účet vznikl, ale roli se nepodařilo uložit: ${profileError.message}` };

  refresh();
  return { info: `Pozvánka odešla na ${email}.` };
}

export type RoleState = { error?: string; info?: string };

/** Změna role uživatele. Admin nemůže sebrat roli sám sobě (aby se nezamkl). */
export async function changeRole(userId: string, role: Role): Promise<RoleState> {
  const me = await requireAdmin();
  if (!ROLES.includes(role)) return { error: "Neznámá role." };
  if (userId === me.id && role !== "admin") return { error: "Sám sobě roli admina odebrat nemůžeš." };
  if (!isSupabase) return { info: "Ukázkový režim: změna rolí se neukládá." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    // Ročník mají jen studenti — při změně na vyučujícího ho smažeme.
    .update(role === "student" ? { role } : { role, grade: null })
    .eq("id", userId)
    .select("id");
  if (error || !data?.length) return { error: "Roli se nepodařilo změnit." };
  refresh();
  return { info: "Role je uložená." };
}

/** Admin upraví jméno a příjmení uživatele. */
export async function renameUser(userId: string, fullName: string): Promise<RoleState> {
  await requireAdmin();
  const name = fullName.replace(/\s+/g, " ").trim();
  if (name.length < 3 || !name.includes(" ")) return { error: "Napiš jméno i příjmení, např. Jana Nováková." };
  if (name.length > 80) return { error: "Jméno je moc dlouhé." };
  if (!isSupabase) return { info: "Ukázkový režim: změny se neukládají." };

  const admin = createAdminClient();
  const { data, error } = await admin.from("profiles").update({ full_name: name }).eq("id", userId).select("id");
  if (error || !data?.length) return { error: "Jméno se nepodařilo uložit." };
  refresh();
  return { info: "Jméno je uložené." };
}
