// Úklid úložiště: smaže soubory, na které už nic v databázi neodkazuje
// (smazaná zpráva, příspěvek, úkol, tým, vyměněná profilovka…).
// Seznam vrací databázová funkce storage_orphans(); mazat smí jen server se secret key.
// Spouští ho každou noc Vercel Cron (/api/cron/uklid) a admin ve Správě → Úložiště.

import "server-only";
import { createAdminClient } from "./supabase/server";

export const BUCKET_LABEL: Record<string, string> = {
  zpravy: "Soukromé zprávy",
  chat: "Chat tříd",
  tymy: "Týmové chaty",
  prispevky: "Nástěnka",
  materialy: "Úkoly a materiály",
  odevzdani: "Odevzdané práce",
  avatary: "Profilové fotky",
};

export type StorageReport = {
  buckets: { id: string; label: string; files: number; bytes: number }[];
  totalBytes: number;
  /** Nepoužívané soubory starší než den (smaže je úklid) */
  orphans: { files: number; bytes: number };
  /** Nepoužívané soubory mladší než den (úklid je smaže, až zestárnou) */
  young: { files: number; bytes: number };
};

type Orphan = { bucket: string; path: string; size: number };

async function orphans(minAge?: string): Promise<Orphan[]> {
  const { data, error } = await createAdminClient().rpc("storage_orphans", minAge ? { min_age: minAge } : {});
  if (error) throw new Error(`storage_orphans: ${error.message}`);
  return ((data ?? []) as Orphan[]).map((o) => ({ ...o, size: Number(o.size) }));
}

/** Obsazené místo po složkách a kolik by úklid uvolnil. */
export async function storageReport(): Promise<StorageReport> {
  const sb = createAdminClient();
  const [{ data, error }, orph, all] = await Promise.all([sb.rpc("storage_usage"), orphans(), orphans("0 seconds")]);
  if (error) throw new Error(`storage_usage: ${error.message}`);
  const rows = (data ?? []) as { bucket: string; files: number; bytes: number }[];
  const buckets = rows
    .map((r) => ({ id: r.bucket, label: BUCKET_LABEL[r.bucket] ?? r.bucket, files: Number(r.files), bytes: Number(r.bytes) }))
    .sort((a, b) => b.bytes - a.bytes);
  return {
    buckets,
    totalBytes: buckets.reduce((s, b) => s + b.bytes, 0),
    orphans: { files: orph.length, bytes: orph.reduce((s, o) => s + o.size, 0) },
    young: { files: all.length - orph.length, bytes: all.reduce((s, o) => s + o.size, 0) - orph.reduce((s, o) => s + o.size, 0) },
  };
}

/** Smaže nepoužívané soubory. Vrací, kolik souborů a bajtů se smazalo. */
export async function cleanupStorage(): Promise<{ files: number; bytes: number; failed: number }> {
  const list = await orphans();
  const sb = createAdminClient();
  const byBucket = new Map<string, Orphan[]>();
  for (const o of list) byBucket.set(o.bucket, [...(byBucket.get(o.bucket) ?? []), o]);
  let files = 0;
  let bytes = 0;
  let failed = 0;
  for (const [bucket, items] of byBucket) {
    for (let i = 0; i < items.length; i += 100) {
      const chunk = items.slice(i, i + 100);
      const { data, error } = await sb.storage.from(bucket).remove(chunk.map((o) => o.path));
      if (error) {
        failed += chunk.length;
        continue;
      }
      const removed = new Set((data ?? []).map((d) => d.name));
      for (const o of chunk) {
        if (removed.has(o.path)) {
          files++;
          bytes += o.size;
        } else failed++;
      }
    }
  }
  return { files, bytes, failed };
}
