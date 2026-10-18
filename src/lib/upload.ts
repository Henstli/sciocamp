// Nahrávání souborů do Supabase Storage přímo z prohlížeče (soubor nejde přes server).

import { createClient } from "./supabase/client";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Název souboru bezpečný pro úložiště (bez diakritiky a zvláštních znaků). */
export function safeName(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (cleaned || "soubor").slice(-100);
}

/**
 * Nahraje soubory do složky `folder` v `bucket`. Každý dostane předponu s časem,
 * aby se stejné názvy nepřepsaly. Vrací chybovou hlášku, nebo null.
 */
export async function uploadFiles(
  bucket: string,
  folder: string,
  files: File[],
  onProgress?: (name: string | null) => void,
): Promise<string | null> {
  const sb = createClient();
  let problem: string | null = null;
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      problem = `Soubor „${file.name}“ je větší než 25 MB. Nahraj ho na Google Disk a přidej odkaz.`;
      continue;
    }
    onProgress?.(file.name);
    const path = `${folder}/${Date.now()}-${safeName(file.name)}`;
    const { error } = await sb.storage.from(bucket).upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) {
      problem = `Soubor „${file.name}“ se nepodařilo nahrát. Zkus to znovu.`;
      break;
    }
  }
  onProgress?.(null);
  return problem;
}

export async function removeFile(bucket: string, path: string): Promise<boolean> {
  const { error } = await createClient().storage.from(bucket).remove([path]);
  return !error;
}
