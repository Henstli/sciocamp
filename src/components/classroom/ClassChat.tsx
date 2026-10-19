"use client";

import { TeamMembers, type TeamMember } from "../assignments/TeamMembers";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Avatar, profileHref } from "../PageHeader";
import { createClient } from "@/lib/supabase/client";
import { formatStamp } from "@/lib/time";
import type { SubmissionFile } from "@/lib/types";
import { MAX_UPLOAD_BYTES, uploadFilesDetailed } from "@/lib/upload";
import { Attachment } from "../Attachment";
import { UNKNOWN_PERSON, toneFor, type Person } from "./people";
import styles from "./classroom.module.css";

export type ChatLine = { id: string; authorId: string; body: string; createdAt: string; when: string; file: SubmissionFile | null };

type Row = {
  id: string;
  author_id: string;
  body: string;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
};

/** Chat třídy, nebo chat jednoho týmu. */
const KINDS = {
  class: { table: "class_messages", column: "activity_id", bucket: "chat", placeholder: "Zpráva pro celou třídu…" },
  team: { table: "team_messages", column: "team_id", bucket: "tymy", placeholder: "Zpráva pro tým…" },
} as const;
const COLUMNS = "id, author_id, body, file_path, file_name, file_size, created_at";

const toLine = (r: Row): ChatLine => ({
  id: r.id,
  authorId: r.author_id,
  body: r.body,
  createdAt: r.created_at,
  when: formatStamp(r.created_at, new Date()),
  file: r.file_path ? { path: r.file_path, name: r.file_name ?? "soubor", size: r.file_size } : null,
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
}: {
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
  /** Vyučující třídy a admin smí mazat cizí zprávy */
  canModerate: boolean;
}) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const realtime = live && !!activityDbId;
  const cfg = KINDS[kind];
  const BUCKET = cfg.bucket;

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
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: cfg.table }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (id) setMessages((m) => m.filter((x) => x.id !== id));
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

  // Držet seznam dole u nejnovější zprávy.
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body && !file) return;
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
          file: file ? { path: "", name: file.name, size: file.size } : null,
        },
      ]);
      setDraft("");
      setFile(null);
      return;
    }
    if (file && file.size > MAX_UPLOAD_BYTES) return setError("Soubor je větší než 25 MB. Nahraj ho na Google Disk a pošli odkaz.");
    setSending(true);
    let attached: { path: string; name: string; size: number } | null = null;
    if (file) {
      const { problem, uploaded } = await uploadFilesDetailed(BUCKET, activityDbId!, [file]);
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
      })
      .select(COLUMNS)
      .single();
    setSending(false);
    if (err || !data) return setError("Zprávu se nepodařilo odeslat. Zkus to znovu.");
    setDraft("");
    setFile(null);
    const line = toLine(data as Row);
    setMessages((m) => (m.some((x) => x.id === line.id) ? m : [...m, line]));
  }

  async function remove(id: string) {
    if (!realtime) return setMessages((m) => m.filter((x) => x.id !== id));
    const { error: err } = await createClient().from(cfg.table).delete().eq("id", id);
    if (err) return setError("Zprávu se nepodařilo smazat.");
    setMessages((m) => m.filter((x) => x.id !== id));
  }

  return (
    <section aria-label={label} className={`card ${styles.chat}`}>
      {title && <h2 className={styles.chatTitle}>{title}</h2>}
      {members && members.length > 0 && (
        <div className={styles.chatMembers}>
          <span className={styles.chatMembersLabel}>V týmu ({members.length}):</span>
          <TeamMembers members={members} compact />
        </div>
      )}
      <div className={styles.chatList} ref={list} aria-live="polite">
        {messages.length === 0 && <div className={styles.meta}>Zatím tu nikdo nic nenapsal. Začni ty!</div>}
        {messages.map((m) => {
          const author = people[m.authorId] ?? (m.authorId === me.id ? me : UNKNOWN_PERSON);
          return (
            <div key={m.id} className={styles.msg}>
              <Avatar initials={author.initials} size={36} tone={toneFor(author, me.id)} href={author.id !== "?" ? profileHref(author.id) : undefined} title={author.name} />
              <div className={styles.grow}>
                <div className={styles.msgHead}>
                  <span className={styles.strong}>{author.name}</span>
                  <span className={styles.meta}>{m.when}</span>
                </div>
                {m.body && <div className={styles.msgText}>{m.body}</div>}
                {m.file && (
                  <div className={styles.msgFile}>
                    <Attachment bucket={BUCKET} file={m.file} live={realtime} />
                  </div>
                )}
              </div>
              {(m.authorId === me.id || canModerate) && (
                <button type="button" className={`${styles.iconBtn} ${styles.msgDelete}`} aria-label="Smazat zprávu" onClick={() => void remove(m.id)}>
                  <Icon name="trash" size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>
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
      >
        <input
          ref={fileInput}
          type="file"
          id={`chat-priloha-${kind}-${activityDbId ?? "demo"}`}
          className="sr-only"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            if (fileInput.current) fileInput.current.value = "";
          }}
        />
        <label htmlFor={`chat-priloha-${kind}-${activityDbId ?? "demo"}`} className={styles.chatAttach} aria-label="Přiložit soubor nebo obrázek">
          <Icon name="paperclip" size={20} />
        </label>
        <label className={styles.grow}>
          <span className="sr-only">{cfg.placeholder}</span>
          <input
            type="text"
            placeholder={cfg.placeholder}
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            className={styles.composerInput}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={sending || (!draft.trim() && !file)}>
          <Icon name="send" size={18} />
          {sending ? "Odesílám…" : "Odeslat"}
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
