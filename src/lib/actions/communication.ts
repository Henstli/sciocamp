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

// ---------------------------------------------------------------------------
// Skupinové chaty (oprávnění hlídají RPC v databázi: správce = is_admin)
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f-]{36}$/i;

/** Chybová hláška z databáze (naše RAISE jsou česky), jinak obecná. */
function groupError(error: { code?: string; message?: string } | null, fallback: string): ActionResult {
  if (!error) return {};
  if ((error.code === "42501" || error.code === "22023") && error.message) return { error: error.message };
  return { error: fallback };
}

function cleanIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === "string" && UUID.test(id)))].slice(0, 200);
}

/** Založí skupinu (zakladatel je správce) a vrátí její id. */
export async function createGroup(title: string, memberIds: string[]): Promise<ActionResult> {
  await requireUser();
  const name = title.trim();
  if (!name) return { error: "Napiš název skupiny." };
  if (name.length > 60) return { error: "Název je moc dlouhý (nejvýš 60 znaků)." };
  if (memberIds.length < 2) return { error: "Vyber aspoň dva další lidi." };
  if (!isSupabase) return { error: DEMO };
  const sb = await createClient();
  const { data, error } = await sb.rpc("create_group", { title: name, members: cleanIds(memberIds) });
  if (error || !data) return groupError(error, "Skupinu se nepodařilo založit.");
  return { id: data as string };
}

export async function renameGroup(conversationId: string, title: string): Promise<ActionResult> {
  await requireUser();
  const name = title.trim();
  if (!name) return { error: "Napiš název skupiny." };
  if (name.length > 60) return { error: "Název je moc dlouhý (nejvýš 60 znaků)." };
  if (!isSupabase) return { error: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc("rename_group", { conversation: conversationId, title: name });
  if (error) return groupError(error, "Skupinu se nepodařilo přejmenovat.");
  refresh();
  return {};
}

export async function addGroupMembers(conversationId: string, memberIds: string[]): Promise<ActionResult> {
  await requireUser();
  if (memberIds.length === 0) return { error: "Vyber, koho přidat." };
  if (!isSupabase) return { error: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc("add_group_members", { conversation: conversationId, members: cleanIds(memberIds) });
  if (error) return groupError(error, "Členy se nepodařilo přidat.");
  refresh();
  return {};
}

export async function removeGroupMember(conversationId: string, memberId: string): Promise<ActionResult> {
  await requireUser();
  if (!isSupabase) return { error: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc("remove_group_member", { conversation: conversationId, member: memberId });
  if (error) return groupError(error, "Člena se nepodařilo odebrat.");
  refresh();
  return {};
}

export async function setGroupAdmin(conversationId: string, memberId: string, admin: boolean): Promise<ActionResult> {
  await requireUser();
  if (!isSupabase) return { error: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc("set_group_admin", { conversation: conversationId, member: memberId, admin });
  if (error) return groupError(error, "Správce se nepodařilo změnit.");
  refresh();
  return {};
}

export async function leaveGroup(conversationId: string): Promise<ActionResult> {
  await requireUser();
  if (!isSupabase) return { error: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc("leave_group", { conversation: conversationId });
  if (error) return groupError(error, "Skupinu se nepodařilo opustit.");
  return {};
}

export async function deleteGroup(conversationId: string): Promise<ActionResult> {
  await requireUser();
  if (!isSupabase) return { error: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc("delete_group", { conversation: conversationId });
  if (error) return groupError(error, "Skupinu se nepodařilo smazat.");
  return {};
}

/** Označí konverzaci jako přečtenou. */
export async function markConversationRead(conversationId: string, refreshAfter = true): Promise<void> {
  const user = await requireUser();
  if (!isSupabase) return;
  const sb = await createClient();
  await sb
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString(), delivered_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);
  // Notifikace o zprávách z téhle konverzace už nejsou potřeba.
  await sb
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("kind", "zprava")
    .eq("href", `/zpravy?k=${conversationId}`)
    .is("read_at", null);
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
