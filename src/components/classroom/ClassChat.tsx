"use client";

import { TeamMembers, type TeamMember } from "../assignments/TeamMembers";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Avatar, profileHref } from "../PageHeader";
import { createClient } from "@/lib/supabase/client";
import { formatStamp } from "@/lib/time";
import type { ChatMeta, SubmissionFile } from "@/lib/types";
import { useStickToBottom } from "@/lib/use-stick-to-bottom";
import { isCompressibleImage } from "@/lib/image-compress";
import { tooBigMessage, uploadFilesDetailed, uploadLimit } from "@/lib/upload";
import { Attachment } from "../Attachment";
import { ComposerPlus, GifImage, insertAtCursor } from "../composer/ComposerPlus";
import { isGifUrl } from "../composer/gif";
import { MentionInput } from "../composer/MentionInput";
import { MentionText } from "../composer/MentionText";
import { encodeMentions } from "@/lib/mentions";
import { applyReaction, editableText, messageSnippet, type ChatKind } from "@/lib/chat";
import { deleteChatMessage, editChatMessage, pinChatMessage, setReaction, useChatLive } from "@/lib/chat-client";
import { ComposerContext, MessageTools, PinnedBar, Reactions, ReplyQuote, messageDomId } from "../chat/ChatBits";
import chatStyles from "../chat/chat.module.css";
import { UNKNOWN_PERSON, toneFor, type Person } from "./people";
import styles from "./classroom.module.css";

export type ChatLine = { id: string; authorId: string; body: string; createdAt: string; when: string; file: SubmissionFile | null } & ChatMeta;

type Row = {
  id: string;
  author_id: string;
  body: string;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
  reply_to?: string | null;
  edited_at?: string | null;
  pinned_at?: string | null;
  pinned_by?: string | null;
};

/** Chat třídy, nebo chat jednoho týmu. */
const KINDS = {
  class: { table: "class_messages", column: "activity_id", bucket: "chat", placeholder: "Zpráva pro celou třídu…", chat: "trida" as ChatKind },
  team: { table: "team_messages", column: "team_id", bucket: "tymy", placeholder: "Zpráva pro tým…", chat: "tym" as ChatKind },
} as const;
const COLUMNS = "id, author_id, body, file_path, file_name, file_size, created_at, reply_to, edited_at, pinned_at, pinned_by";

const toLine = (r: Row): ChatLine => ({
  id: r.id,
  authorId: r.author_id,
  body: r.body,
  createdAt: r.created_at,
  when: formatStamp(r.created_at, new Date()),
  file: r.file_path ? { path: r.file_path, name: r.file_name ?? "soubor", size: r.file_size } : null,
  replyTo: r.reply_to ?? null,
  editedAt: r.edited_at ?? null,
  pinnedAt: r.pinned_at ?? null,
  pinnedBy: r.pinned_by ?? null,
  reactions: [],
});

/** Chat třídy nebo týmu. Naostro se nové zprávy objevují samy (Supabase Realtime). */
export function ClassChat({
  initial,
  me,
  people,
  activityDbId,
  live,
  canModerate,
  kind = "class",
  label = "Chat třídy",
  title,
  members,
  mentionIds,
}: {
  /** Koho jde zmínit přes @ (id lidí); výchozí = všichni z `people` */
  mentionIds?: string[];
  /** Týmový chat: členové týmu pod nadpisem */
  members?: TeamMember[];
  /** Viditelný nadpis nad zprávami (např. u týmového chatu v úkolu) */
  title?: string;
  initial: ChatLine[];
  me: Person;
  people: Record<string, Person>;
  /** Id třídy (u chatu třídy) nebo týmu (u týmového chatu) */
  activityDbId?: string;
  live: boolean;
  kind?: keyof typeof KINDS;
  label?: string;
  /** Vyučující třídy a admin smí mazat cizí zprávy (a v chatu třídy připínat) */
  canModerate: boolean;
}) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  /** Odpovídám na zprávu (id) */
  const [replyTo, setReplyTo] = useState<string | null>(null);
  /** Upravuji svou zprávu (id) */
  const [editing, setEditing] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  // Koho jde zmínit přes @ (studenti a vyučující třídy, u týmu členové týmu a vyučující).
  const allowed = new Set(mentionIds ?? Object.keys(people));
  const mentionable = Object.values(people).filter((p) => p.id !== me.id && p.id !== "?" && allowed.has(p.id));
  const draftInput = useRef<HTMLInputElement>(null);
  const realtime = live && !!activityDbId;
  const cfg = KINDS[kind];
  const BUCKET = cfg.bucket;
  // Připínat smí v chatu třídy vyučující a admin, v týmovém chatu kdokoli z něj.
  const canPin = kind === "team" || canModerate;
  const nameOf = (id: string) => people[id]?.name ?? (id === me.id ? me.name : "Někdo");
  const byId = new Map(messages.map((m) => [m.id, m]));
  const patch = (id: string, change: (m: ChatLine) => ChatLine) => setMessages((ms) => ms.map((m) => (m.id === id ? change(m) : m)));

  // Úpravy, připnutí, smazání a reakce ostatních naživo.
  useChatLive(cfg.chat, activityDbId, realtime, {
    onUpdate: (u) => patch(u.id, (m) => ({ ...m, body: u.body, editedAt: u.editedAt, pinnedAt: u.pinnedAt, pinnedBy: u.pinnedBy })),
    onDelete: (id) => setMessages((m) => m.filter((x) => x.id !== id)),
    onReaction: (id, emoji, userId, add) => patch(id, (m) => ({ ...m, reactions: applyReaction(m.reactions, emoji, userId, add) })),
  });

  // Nové zprávy naživo.
  useEffect(() => {
    if (!realtime) return;
    const sb = createClient();
    let cancelled = false;
    const channel = sb.channel(`${cfg.table}-${activityDbId}`);
    channel
      .on("postgres_changes", { event: "INSERT", schema: "public", table: cfg.table, filter: `${cfg.column}=eq.${activityDbId}` }, (payload) => {
        const line = toLine(payload.new as Row);
        setMessages((m) => (m.some((x) => x.id === line.id) ? m : [...m, line]));
      });
    void sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) sb.realtime.setAuth(data.session.access_token);
      channel.subscribe();
    });
    return () => {
      cancelled = true;
      void sb.removeChannel(channel);
    };
  }, [realtime, activityDbId, cfg.table, cfg.column]);

  // Chat začíná dole a drží se dole (pokud si člověk neodroluje nahoru).
  const stickToBottom = useStickToBottom(list, activityDbId);

  /** Odešle rozepsanou zprávu, nebo rovnou GIF (`gif` = odkaz). */
  async function send(gif?: string) {
    if (editing && !gif) return saveEdit();
    stickToBottom();
    const body = gif ?? encodeMentions(draft.trim(), mentionable);
    const file_ = gif ? null : file;
    const reply = replyTo;
    const clear = () => {
      setReplyTo(null);
      if (gif) return;
      setDraft("");
      setFile(null);
    };
    if (!body && !file_) return;
    setError(null);
    if (!realtime) {
      setMessages((m) => [
        ...m,
        {
          id: `local-${m.length}`,
          authorId: me.id,
          body,
          createdAt: new Date().toISOString(),
          when: "teď",
          file: file_ ? { path: "", name: file_.name, size: file_.size } : null,
          replyTo: reply,
          reactions: [],
        },
      ]);
      clear();
      return;
    }
    if (file_ && file_.size > uploadLimit(BUCKET) && !isCompressibleImage(file_)) return setError(tooBigMessage(BUCKET));
    setSending(true);
    let attached: { path: string; name: string; size: number } | null = null;
    if (file_) {
      const { problem, uploaded } = await uploadFilesDetailed(BUCKET, activityDbId!, [file_]);
      if (problem || !uploaded[0]) {
        setSending(false);
        return setError(problem ?? "Přílohu se nepodařilo nahrát.");
      }
      attached = uploaded[0];
    }
    const { data, error: err } = await createClient()
      .from(cfg.table)
      .insert({
        [cfg.column]: activityDbId,
        body,
        file_path: attached?.path ?? null,
        file_name: attached?.name ?? null,
        file_size: attached?.size ?? null,
        reply_to: reply,
      })
      .select(COLUMNS)
      .single();
    setSending(false);
    if (err || !data) return setError("Zprávu se nepodařilo odeslat. Zkus to znovu.");
    clear();
    const line = toLine(data as Row);
    setMessages((m) => (m.some((x) => x.id === line.id) ? m : [...m, line]));
  }

  async function remove(id: string) {
    if (editing === id) cancelContext();
    if (realtime) {
      const res = await deleteChatMessage(cfg.chat, id);
      if (res.error) return setError(res.error);
    }
    setMessages((m) => m.filter((x) => x.id !== id));
  }

  async function react(m: ChatLine, emoji: string, add: boolean) {
    patch(m.id, (x) => ({ ...x, reactions: applyReaction(x.reactions, emoji, me.id, add) }));
    if (!realtime) return;
    const res = await setReaction(cfg.chat, m.id, emoji, add, me.id);
    if (res.error) {
      patch(m.id, (x) => ({ ...x, reactions: applyReaction(x.reactions, emoji, me.id, !add) }));
      setError(res.error);
    }
  }

  async function pin(m: ChatLine) {
    const pinned = !m.pinnedAt;
    const before = { pinnedAt: m.pinnedAt, pinnedBy: m.pinnedBy };
    patch(m.id, (x) => ({ ...x, pinnedAt: pinned ? new Date().toISOString() : null, pinnedBy: pinned ? me.id : null }));
    if (!realtime) return;
    const res = await pinChatMessage(cfg.chat, m.id, pinned);
    if (res.error) {
      patch(m.id, (x) => ({ ...x, ...before }));
      setError(res.error);
    }
  }

  function startReply(m: ChatLine) {
    setEditing(null);
    setReplyTo(m.id);
    draftInput.current?.focus();
  }

  function startEdit(m: ChatLine) {
    setReplyTo(null);
    setFile(null);
    setEditing(m.id);
    setDraft(editableText(m.body));
    draftInput.current?.focus();
  }

  function cancelContext() {
    if (editing) setDraft("");
    setEditing(null);
    setReplyTo(null);
  }

  async function saveEdit() {
    const m = editing ? byId.get(editing) : null;
    if (!m) return cancelContext();
    const body = encodeMentions(draft.trim(), mentionable);
    if (!body && !m.file) return setError("Prázdnou zprávu uložit nejde. Smazat ji můžeš v nabídce u zprávy.");
    setError(null);
    if (body === m.body) return cancelContext();
    if (realtime) {
      setSending(true);
      const res = await editChatMessage(cfg.chat, m.id, body);
      setSending(false);
      if (res.error) return setError(res.error);
      patch(m.id, (x) => ({ ...x, body, editedAt: res.editedAt ?? new Date().toISOString() }));
    } else {
      patch(m.id, (x) => ({ ...x, body, editedAt: new Date().toISOString() }));
    }
    setEditing(null);
    setDraft("");
  }

  const replyTarget = (id: string) => {
    const t = byId.get(id);
    return t ? { id: t.id, authorName: nameOf(t.authorId), snippet: messageSnippet(t.body, t.file?.name, 70) } : null;
  };
  const pinnedItems = messages
    .filter((m) => m.pinnedAt)
    .sort((a, b) => (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? ""))
    .map((m) => ({ id: m.id, authorName: nameOf(m.authorId), snippet: messageSnippet(m.body, m.file?.name) }));
  const replying = replyTo ? byId.get(replyTo) : null;
  const editingMsg = editing ? byId.get(editing) : null;

  return (
    <section aria-label={label} className={`card ${styles.chat}`}>
      {title && <h2 className={styles.chatTitle}>{title}</h2>}
      {members && members.length > 0 && (
        <div className={styles.chatMembers}>
          <span className={styles.chatMembersLabel}>V týmu ({members.length}):</span>
          <TeamMembers members={members} compact />
        </div>
      )}
      <PinnedBar items={pinnedItems} canUnpin={canPin} onUnpin={(id) => { const m = byId.get(id); if (m) void pin(m); }} />
      <div className={styles.chatList} ref={list} aria-live="polite">
        {messages.length === 0 && <div className={styles.meta}>Zatím tu nikdo nic nenapsal. Začni ty!</div>}
        {messages.map((m) => {
          const author = people[m.authorId] ?? (m.authorId === me.id ? me : UNKNOWN_PERSON);
          const mine = m.authorId === me.id;
          const local = m.id.startsWith("local-") && realtime;
          return (
            <div key={m.id} id={messageDomId(m.id)} tabIndex={-1} className={`${styles.msg} ${chatStyles.line}`}>
              <Avatar presence initials={author.initials} size={36} tone={toneFor(author, me.id)} href={author.id !== "?" ? profileHref(author.id) : undefined} title={author.name} />
              <div className={styles.grow}>
                <div className={styles.msgHead}>
                  <span className={styles.strong}>{author.name}</span>
                  <span className={styles.meta}>
                    {m.when}
                    {m.editedAt && <span className={chatStyles.edited}> · upraveno</span>}
                    {m.pinnedAt && (
                      <span className={chatStyles.pinMark}>
                        {" "}· <Icon name="pushpin" size={12} /> připnuto
                      </span>
                    )}
                  </span>
                </div>
                {m.replyTo && (
                  <div className={styles.msgQuote}>
                    <ReplyQuote target={replyTarget(m.replyTo)} />
                  </div>
                )}
                {m.body && (isGifUrl(m.body) ? <GifImage url={m.body} /> : <div className={styles.msgText}><MentionText body={m.body} meId={me.id} initialsOf={(id) => people[id]?.initials} /></div>)}
                {m.file && (
                  <div className={styles.msgFile}>
                    <Attachment bucket={BUCKET} file={m.file} live={realtime} />
                  </div>
                )}
                <div className={styles.msgReactions}>
                  <Reactions reactions={m.reactions} meId={me.id} nameOf={nameOf} onToggle={(e, add) => void react(m, e, add)} />
                </div>
              </div>
              {!local && (
                <MessageTools
                  align="end"
                  myReactions={(m.reactions ?? []).filter((r) => r.userIds.includes(me.id)).map((r) => r.emoji)}
                  canEdit={mine && !!m.body && !isGifUrl(m.body)}
                  canDelete={mine || canModerate}
                  canPin={canPin}
                  pinned={!!m.pinnedAt}
                  onReact={(e) => {
                    const has = (m.reactions ?? []).some((r) => r.emoji === e && r.userIds.includes(me.id));
                    void react(m, e, !has);
                  }}
                  onReply={() => startReply(m)}
                  onEdit={() => startEdit(m)}
                  onDelete={() => void remove(m.id)}
                  onPin={() => void pin(m)}
                />
              )}
            </div>
          );
        })}
      </div>
      {(replying || editingMsg) && (
        <div className={styles.chatContext}>
          {editingMsg ? (
            <ComposerContext mode="edit" title="Upravuješ zprávu" snippet={messageSnippet(editingMsg.body, editingMsg.file?.name)} onCancel={cancelContext} />
          ) : (
            replying && (
              <ComposerContext
                mode="reply"
                title={`Odpovídáš: ${nameOf(replying.authorId)}`}
                snippet={messageSnippet(replying.body, replying.file?.name)}
                onCancel={cancelContext}
              />
            )
          )}
        </div>
      )}
      {file && (
        <div className={styles.chatPending}>
          <Icon name="file" size={16} />
          <span className={styles.grow}>{file.name}</span>
          <button type="button" className={styles.iconBtn} aria-label="Odebrat přílohu" onClick={() => setFile(null)}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      <form
        className={styles.chatForm}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !e.defaultPrevented && (replyTo || editing)) {
            e.preventDefault();
            cancelContext();
          }
        }}
      >
        {!editing && (
          <ComposerPlus
          idPrefix={`chat-${kind}-${activityDbId ?? "demo"}`}
          onFile={setFile}
          onEmoji={(e) => setDraft((d) => insertAtCursor(draftInput.current, d, e))}
          onGif={(url) => void send(url)}
          />
        )}
        <label className={styles.grow}>
          <span className="sr-only">{cfg.placeholder}</span>
          <MentionInput
            placeholder={`${cfg.placeholder.replace("…", "")} (@ někoho zmíní)`}
            value={draft}
            maxLength={2000}
            onChange={setDraft}
            inputRef={draftInput}
            people={mentionable}
            className={styles.composerInput}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={sending || (!draft.trim() && !file)}>
          <Icon name={editing ? "tick" : "send"} size={18} />
          {sending ? (editing ? "Ukládám…" : "Odesílám…") : editing ? "Uložit" : "Odeslat"}
        </button>
      </form>
      {error && (
        <p role="alert" className={`${styles.formError} ${styles.chatNote}`}>
          {error}
        </p>
      )}
      {!realtime && <div className={styles.chatNote}>Ukázkový režim: zprávy se neukládají.</div>}
    </section>
  );
}
