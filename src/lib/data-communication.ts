// Data etapy 3: nástěnka, chat třídy, soukromé zprávy a notifikace.
// Naostro čte z databáze jako přihlášený uživatel (oprávnění hlídá RLS),
// v ukázkovém režimu vrací data z demo-communication.ts.

import "server-only";
import { cache } from "react";
import { isSupabase } from "./config";
import {
  DEMO_CLASS_CHAT,
  DEMO_CONVERSATIONS,
  DEMO_MESSAGES,
  DEMO_NOTIFICATIONS,
  DEMO_POSTS,
  DEMO_MEMBER_STATE,
} from "./demo-communication";
import { createClient } from "./supabase/server";
import type {
  Activity,
  ClassMessage,
  ConversationSummary,
  DirectMessage,
  LinkItem,
  NotificationItem,
  Post,
  SubmissionFile,
  User,
} from "./types";

export const POST_BUCKET = "prispevky";
export const MESSAGE_BUCKET = "zpravy";
export const CHAT_BUCKET = "chat";

type StoredFile = { path: string; name: string; size: number | null };

/** Doplní k souborům dočasné odkazy ke stažení (jedním dotazem pro všechny). */
async function sign(bucket: string, files: StoredFile[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (files.length === 0) return out;
  const sb = await createClient();
  const { data } = await sb.storage.from(bucket).createSignedUrls(
    files.map((f) => f.path),
    60 * 60,
  );
  data?.forEach((d) => d.path && d.signedUrl && out.set(d.path, d.signedUrl));
  return out;
}

// ---------------------------------------------------------------------------
// Nástěnka
// ---------------------------------------------------------------------------

type PostRow = {
  id: string;
  author_id: string;
  body: string;
  links: LinkItem[];
  files: StoredFile[];
  created_at: string;
  post_comments: { id: string; author_id: string; body: string; created_at: string }[];
};

async function classPostsUncached(activity: Activity): Promise<Post[]> {
  if (!isSupabase || !activity.dbId) return DEMO_POSTS[activity.id] ?? [];
  const sb = await createClient();
  const { data, error } = await sb
    .from("posts")
    .select("id, author_id, body, links, files, created_at, post_comments(id, author_id, body, created_at)")
    .eq("activity_id", activity.dbId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  const rows = data as PostRow[];
  const urls = await sign(POST_BUCKET, rows.flatMap((r) => r.files));
  return rows.map((r) => ({
    id: r.id,
    authorId: r.author_id,
    body: r.body,
    links: r.links,
    files: r.files.map((f): SubmissionFile => ({ ...f, url: urls.get(f.path) })),
    createdAt: r.created_at,
    comments: [...r.post_comments]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((c) => ({ id: c.id, authorId: c.author_id, body: c.body, createdAt: c.created_at })),
  }));
}

// ---------------------------------------------------------------------------
// Chat třídy
// ---------------------------------------------------------------------------

async function classChatUncached(activity: Activity): Promise<ClassMessage[]> {
  if (!isSupabase || !activity.dbId) return DEMO_CLASS_CHAT[activity.id] ?? [];
  const sb = await createClient();
  const { data, error } = await sb
    .from("class_messages")
    .select("id, author_id, body, file_path, file_name, file_size, created_at")
    .eq("activity_id", activity.dbId)
    .order("created_at", { ascending: false })
    .limit(150);
  if (error || !data) return [];
  const files = data.filter((m) => m.file_path).map((m) => ({ path: m.file_path!, name: m.file_name ?? "soubor", size: m.file_size }));
  const urls = await sign(CHAT_BUCKET, files);
  return data.reverse().map((m) => ({
    id: m.id,
    authorId: m.author_id,
    body: m.body,
    createdAt: m.created_at,
    file: m.file_path ? { path: m.file_path, name: m.file_name ?? "soubor", size: m.file_size, url: urls.get(m.file_path) } : null,
  }));
}

// ---------------------------------------------------------------------------
// Soukromé zprávy
// ---------------------------------------------------------------------------

async function conversationsForUncached(user: User): Promise<ConversationSummary[]> {
  if (!isSupabase) return user.id === "u-liska" ? DEMO_CONVERSATIONS : [];
  const sb = await createClient();
  const { data, error } = await sb.rpc("my_conversations");
  if (error || !data) return [];
  return (
    data as {
      conversation_id: string;
      other_id: string;
      last_message_at: string;
      last_body: string | null;
      last_author: string | null;
      last_has_file: boolean;
      unread: number;
    }[]
  ).map((r) => ({
    id: r.conversation_id,
    otherId: r.other_id,
    lastAt: r.last_message_at,
    lastBody: r.last_body ?? "",
    lastMine: r.last_author === user.id,
    lastHasFile: r.last_has_file,
    unread: r.unread,
  }));
}

export async function conversationMessages(conversationId: string): Promise<DirectMessage[]> {
  if (!isSupabase) return DEMO_MESSAGES[conversationId] ?? [];
  const sb = await createClient();
  const { data, error } = await sb
    .from("messages")
    .select("id, author_id, body, file_path, file_name, file_size, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  const files = data.filter((m) => m.file_path).map((m) => ({ path: m.file_path!, name: m.file_name ?? "soubor", size: m.file_size }));
  const urls = await sign(MESSAGE_BUCKET, files);
  return data.reverse().map((m) => ({
    id: m.id,
    authorId: m.author_id,
    body: m.body,
    file: m.file_path ? { path: m.file_path, name: m.file_name ?? "soubor", size: m.file_size, url: urls.get(m.file_path) } : null,
    createdAt: m.created_at,
  }));
}

/** Kdy měl druhý člen konverzace zprávy doručené a přečtené (pro „Doručeno“ / „Přečteno“). */
export async function otherMemberState(conversationId: string, user: User): Promise<{ deliveredAt: string; readAt: string } | null> {
  if (!isSupabase) return DEMO_MEMBER_STATE[conversationId] ?? null;
  const sb = await createClient();
  const { data } = await sb
    .from("conversation_members")
    .select("delivered_at, last_read_at")
    .eq("conversation_id", conversationId)
    .neq("user_id", user.id)
    .maybeSingle();
  return data ? { deliveredAt: data.delivered_at as string, readAt: data.last_read_at as string } : null;
}

/** Kolik nepřečtených zpráv a od koho (pro menu a Domov). */
export async function unreadMessages(user: User): Promise<{ unread: number; from: string[] }> {
  const list = (await conversationsFor(user)).filter((c) => c.unread > 0);
  return { unread: list.reduce((n, c) => n + c.unread, 0), from: list.map((c) => c.otherId) };
}

// ---------------------------------------------------------------------------
// Notifikace
// ---------------------------------------------------------------------------

async function notificationsForUncached(user: User): Promise<NotificationItem[]> {
  if (!isSupabase) return user.id === "u-liska" ? DEMO_NOTIFICATIONS : [];
  const sb = await createClient();
  const { data, error } = await sb
    .from("notifications")
    .select("id, kind, title, body, href, created_at, read_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error || !data) return [];
  return data.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    href: n.href,
    createdAt: n.created_at,
    read: !!n.read_at,
  }));
}

// Výsledky se v rámci jednoho požadavku sdílí (menu i stránka se ptají na totéž).
export const classPosts = cache(classPostsUncached);
export const classChat = cache(classChatUncached);
export const conversationsFor = cache(conversationsForUncached);
export const notificationsFor = cache(notificationsForUncached);
