// Nahrávání souborů do Supabase Storage přímo z prohlížeče (soubor nejde přes server).

import { compressImage } from "./image-compress";
import { createClient } from "./supabase/client";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Chaty a zprávy mají menší limit (fotky se stejně zmenší); úkoly, materiály a nástěnka 25 MB. */
export const CHAT_UPLOAD_BYTES = 10 * 1024 * 1024;
const CHAT_BUCKETS = new Set(["zpravy", "chat", "tymy"]);

/** Limit velikosti souboru pro daný bucket (stejný jako file_size_limit v Supabase). */
export function uploadLimit(bucket: string): number {
  return CHAT_BUCKETS.has(bucket) ? CHAT_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
}

/** „Soubor „x“ je větší než 10 MB. …“ */
export function tooBigMessage(bucket: string, name?: string): string {
  const mb = Math.round(uploadLimit(bucket) / 1024 / 1024);
  const what = name ? `Soubor „${name}“` : "Soubor";
  return CHAT_BUCKETS.has(bucket)
    ? `${what} je větší než ${mb} MB. Nahraj ho na Google Disk a pošli odkaz.`
    : `${what} je větší než ${mb} MB. Nahraj ho na Google Disk a přidej odkaz.`;
}

/** Název souboru bezpečný pro úložiště (bez diakritiky a zvláštních znaků). */
export function safeName(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (cleaned || "soubor").slice(-100);
}

export type UploadedFile = { path: string; name: string; size: number };

/**
 * Nahraje soubory do složky `folder` v `bucket`. Každý dostane předponu s časem,
 * aby se stejné názvy nepřepsaly. Vrací chybovou hlášku (nebo null) a nahrané soubory.
 */
export async function uploadFilesDetailed(
  bucket: string,
  folder: string,
  files: File[],
  onProgress?: (name: string | null) => void,
): Promise<{ problem: string | null; uploaded: UploadedFile[] }> {
  const sb = createClient();
  let problem: string | null = null;
  const uploaded: UploadedFile[] = [];
  for (const original of files) {
    onProgress?.(original.name);
    // Fotky se před nahráním zmenší (viz image-compress.ts).
    const file = await compressImage(original);
    if (file.size > uploadLimit(bucket)) {
      problem = tooBigMessage(bucket, original.name);
      continue;
    }
    const path = `${folder}/${Date.now()}-${safeName(file.name)}`;
    const { error } = await sb.storage.from(bucket).upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) {
      problem = `Soubor „${file.name}“ se nepodařilo nahrát. Zkus to znovu.`;
      break;
    }
    uploaded.push({ path, name: file.name, size: file.size });
  }
  onProgress?.(null);
  return { problem, uploaded };
}

/** Jako uploadFilesDetailed, vrací jen chybovou hlášku (nebo null). */
export async function uploadFiles(
  bucket: string,
  folder: string,
  files: File[],
  onProgress?: (name: string | null) => void,
): Promise<string | null> {
  return (await uploadFilesDetailed(bucket, folder, files, onProgress)).problem;
}

export async function removeFile(bucket: string, path: string): Promise<boolean> {
  const { error } = await createClient().storage.from(bucket).remove([path]);
  return !error;
}
