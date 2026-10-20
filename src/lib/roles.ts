import type { Role, User } from "./types";

export const ROLE_LABEL: Record<Role, string> = {
  student: "Student",
  ucitel: "Učitel",
  admin: "Admin",
};

/** Úkoly a kurzy zadává učitel i admin. */
export function canTeach(role: Role): boolean {
  return role === "ucitel" || role === "admin";
}

export function isAdmin(role: Role): boolean {
  return role === "admin";
}

/** Popisek role pod jménem v navigaci ("Učitelka", "Admin · Učitel" …). */
export function roleCaption(user: User): string {
  if (user.role === "admin") return `Admin · ${looksFeminine(user.name) ? "Učitelka" : "Učitel"}`;
  if (user.role === "ucitel") return looksFeminine(user.name) ? "Učitelka" : "Učitel";
  return "Student";
}

function looksFeminine(name: string): boolean {
  const surname = name.trim().split(/\s+/).at(-1) ?? "";
  return /(ová|á)$/.test(surname);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts.at(-1)![0] : "";
  return (first + last).toUpperCase();
}

export function firstNameVocative(name: string): string {
  // Jednoduchý 5. pád pro pozdrav; nepokrývá všechna jména, ale chybu nezpůsobí.
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (/[aeiouyáéíóúůý]$/i.test(first)) {
    return first.endsWith("a") ? first.slice(0, -1) + "o" : first;
  }
  if (/ec$/i.test(first)) return first.slice(0, -2) + "ci";
  if (/[^aeiouy]r$/i.test(first)) return first.slice(0, -1) + "ře";
  if (/[kh]$/i.test(first)) return first + "u";
  if (/[sšzžcčřjťďň]$/i.test(first)) return first + "i";
  return first + "e";
}
