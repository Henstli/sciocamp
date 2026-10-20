import { NextResponse } from "next/server";
import { isSupabase } from "@/lib/config";
import { cleanupStorage } from "@/lib/storage-cleanup";

/**
 * Noční úklid úložiště (Vercel Cron, viz vercel.json). Vercel posílá
 * hlavičku „Authorization: Bearer <CRON_SECRET>“; bez ní se nic nespustí.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isSupabase) return NextResponse.json({ files: 0, bytes: 0, failed: 0 });
  const result = await cleanupStorage();
  return NextResponse.json(result);
}
