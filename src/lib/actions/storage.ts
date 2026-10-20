"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "../auth";
import { isSupabase } from "../config";
import { formatBytes, plural } from "../format";
import { cleanupStorage } from "../storage-cleanup";

/** Admin ve Správě → Úložiště: hned smaže nepoužívané soubory. */
export async function runStorageCleanup(): Promise<{ error?: string; info?: string }> {
  await requireAdmin();
  if (!isSupabase) return { error: "V ukázkovém režimu se nic nemaže." };
  try {
    const { files, bytes, failed } = await cleanupStorage();
    refresh();
    if (files === 0 && failed === 0) return { info: "Nebylo co uklízet." };
    const done = `Smazáno ${files} ${plural(files, "soubor", "soubory", "souborů")} (${formatBytes(bytes)}).`;
    return failed ? { error: `${done} ${failed} se smazat nepodařilo, zkus to později.` } : { info: done };
  } catch {
    return { error: "Úklid se nepodařilo spustit." };
  }
}
