"use server";

// Serverové akce etapy 3. Chat třídy a soukromé zprávy se posílají přímo
// z prohlížeče (kvůli rychlosti a Realtime) — oprávnění hlídá RLS v databázi.

import { refresh } from "next/cache";
import { parseLinks } from "../assignments";
import { requireUser } from "../auth";
import { isSupabase } from "../config";
import { getActivity, getUserById, teachesActivity } from "../data";
import { POST_BUCKET, notificationsFor } from "../data-communication";
import { formatStamp } from "../time";
import { createClient } from "../supabase/server";

const DEMO = "Ukázkový režim: změny se neukládají.";

export type ActionResult = { error?: string; info?: string; id?: string };

type UploadedFile = { path: string; name: string; size: number | null };

function parseFiles(raw: string, folder: string): UploadedFile[] | null {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as UploadedFile[];
    if (!Array.isArray(list) || list.length > 20) return null;
    const ok = list.every(
      (f) => typeof f.path === "string" && f.path.startsWith(`${folder}/`) && !f.path.includes("..") && typeof f.name === "string",
    );
    return ok ? list.map((f) => ({ path: f.path, name: f.name.slice(0, 200), size: typeof f.size === "number" ? f.size : null })) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Nástěnka
// ---------------------------------------------------------------------------

/** Nový příspěvek. Soubory už nahrál prohlížeč do složky třídy v bucketu „prispevky“. */
export async function createPost(activitySlug: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const activity = await getActivity(activitySlug);
  if (!activity || !teachesActivity(user, activity)) return { error: "Do téhle třídy příspěvky psát nemůžeš." };
  const body = String(formData.get("body") ?? "").trim();
  const { links, bad } = parseLinks(String(formData.get("links") ?? ""));
  if (!body) return { error: "Napiš text příspěvku." };
  if (body.length > 5000) return { error: "Příspěvek je moc dlouhý (nejvýš 5 000 znaků)." };
  if (bad) return { error: `Tohle není platný odkaz: ${bad}` };
  if (!isSupabase || !activity.dbId) return { info: DEMO };
  const files = parseFiles(String(formData.get("files") ?? ""), activity.dbId);
  if (!files) return { error: "Přílohy se nepodařilo zpracovat. Nahraj je znovu." };

  const sb = await createClient();
  const { error } = await sb.from("posts").insert({ activity_id: activity.dbId, body, links, files });
  if (error) return { error: "Příspěvek se nepodařilo uložit." };
  refresh();
  return { info: "Příspěvek je na nástěnce." };
}

export async function deletePost(postId: string): Promise<ActionResult> {
  await requireUser();
  if (!isSupabase) return { error: DEMO };
  const sb = await createClient();
  const { data, error } = await sb.from("posts").delete().eq("id", postId).select("files");
  if (error || !data?.length) return { error: "Příspěvek se nepodařilo smazat." };
  const paths = (data[0].files as UploadedFile[]).map((f) => f.path);
  if (paths.length) await sb.storage.from(POST_BUCKET).remove(paths);
  refresh();
  return {};
}

export async function addPostComment(postId: string, body: string): Promise<ActionResult> {
  await requireUser();
  const text = body.trim();
  if (!text) return { error: "Napiš komentář." };
  if (text.length > 2000) return { error: "Komentář je moc dlouhý." };
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await sb.from("post_comments").insert({ post_id: postId, body: text });
  if (error) return { error: "Komentář se nepodařilo uložit." };
  refresh();
  return {};
}

export async function deletePostComment(commentId: string): Promise<ActionResult> {
  await requireUser();
  if (!isSupabase) return { error: DEMO };
  const sb = await createClient();
  const { data, error } = await sb.from("post_comments").delete().eq("id", commentId).select("id");
  if (error || !data?.length) return { error: "Komentář se nepodařilo smazat." };
  refresh();
  return {};
}

// ---------------------------------------------------------------------------
// Zprávy
// ---------------------------------------------------------------------------

/** Najde nebo založí konverzaci s člověkem a vrátí její id. */
export async function startConversation(otherId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (otherId === user.id) return { error: "Sám sobě psát nejde." };
  const other = await getUserById(otherId);
  if (!other) return { error: "Tenhle člověk ve škole není." };
  if (!isSupabase) return { id: `demo-${otherId}` };
  const sb = await createClient();
  const { data, error } = await sb.rpc("start_conversation", { other: otherId });
  if (error || !data) return { error: "Konverzaci se nepodařilo založit." };
  return { id: data as string };
}

/** Označí konverzaci jako přečtenou. */
export async function markConversationRead(conversationId: string, refreshAfter = true): Promise<void> {
  const user = await requireUser();
  if (!isSupabase) return;
  const sb = await createClient();
  await sb
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);
  if (refreshAfter) refresh();
}

// ---------------------------------------------------------------------------
// Notifikace
// ---------------------------------------------------------------------------

export type BellItem = { id: string; kind: string; title: string; body: string | null; href: string | null; when: string; read: boolean };

/** Notifikace pro zvoneček (načítá si je sám v prohlížeči). */
export async function loadNotifications(): Promise<{ items: BellItem[]; userId: string; live: boolean }> {
  const user = await requireUser();
  const now = new Date();
  const items = (await notificationsFor(user)).map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    href: n.href,
    when: formatStamp(n.createdAt, now),
    read: n.read,
  }));
  return { items, userId: user.id, live: isSupabase };
}

/** Označí notifikace jako přečtené (bez id = všechny). */
export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const user = await requireUser();
  if (!isSupabase) return;
  const sb = await createClient();
  let q = sb.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  if (ids?.length) q = q.in("id", ids);
  await q;
  refresh();
}
