"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Avatar } from "../PageHeader";
import { createClient } from "@/lib/supabase/client";
import { formatStamp } from "@/lib/time";
import { UNKNOWN_PERSON, toneFor, type Person } from "./people";
import styles from "./classroom.module.css";

export type ChatLine = { id: string; authorId: string; body: string; createdAt: string; when: string };

type Row = { id: string; activity_id: string; author_id: string; body: string; created_at: string };

const toLine = (r: Row): ChatLine => ({
  id: r.id,
  authorId: r.author_id,
  body: r.body,
  createdAt: r.created_at,
  when: formatStamp(r.created_at, new Date()),
});

/** Chat třídy. Naostro se nové zprávy objevují samy (Supabase Realtime). */
export function ClassChat({
  initial,
  me,
  people,
  activityDbId,
  live,
  canModerate,
}: {
  initial: ChatLine[];
  me: Person;
  people: Record<string, Person>;
  activityDbId?: string;
  live: boolean;
  /** Vyučující třídy a admin smí mazat cizí zprávy */
  canModerate: boolean;
}) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const realtime = live && !!activityDbId;

  // Nové zprávy naživo.
  useEffect(() => {
    if (!realtime) return;
    const sb = createClient();
    let cancelled = false;
    const channel = sb.channel(`chat-${activityDbId}`);
    channel
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "class_messages", filter: `activity_id=eq.${activityDbId}` }, (payload) => {
        const line = toLine(payload.new as Row);
        setMessages((m) => (m.some((x) => x.id === line.id) ? m : [...m, line]));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "class_messages" }, (payload) => {
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
  }, [realtime, activityDbId]);

  // Držet seznam dole u nejnovější zprávy.
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    if (!realtime) {
      setMessages((m) => [
        ...m,
        { id: `local-${m.length}`, authorId: me.id, body, createdAt: new Date().toISOString(), when: "teď" },
      ]);
      setDraft("");
      return;
    }
    setSending(true);
    const { data, error: err } = await createClient()
      .from("class_messages")
      .insert({ activity_id: activityDbId, body })
      .select("id, activity_id, author_id, body, created_at")
      .single();
    setSending(false);
    if (err || !data) return setError("Zprávu se nepodařilo odeslat. Zkus to znovu.");
    setDraft("");
    const line = toLine(data as Row);
    setMessages((m) => (m.some((x) => x.id === line.id) ? m : [...m, line]));
  }

  async function remove(id: string) {
    if (!realtime) return setMessages((m) => m.filter((x) => x.id !== id));
    const { error: err } = await createClient().from("class_messages").delete().eq("id", id);
    if (err) return setError("Zprávu se nepodařilo smazat.");
    setMessages((m) => m.filter((x) => x.id !== id));
  }

  return (
    <section aria-label="Chat třídy" className={`card ${styles.chat}`}>
      <div className={styles.chatList} ref={list} aria-live="polite">
        {messages.length === 0 && <div className={styles.meta}>Zatím tu nikdo nic nenapsal. Začni ty!</div>}
        {messages.map((m) => {
          const author = people[m.authorId] ?? (m.authorId === me.id ? me : UNKNOWN_PERSON);
          return (
            <div key={m.id} className={styles.msg}>
              <Avatar initials={author.initials} size={36} tone={toneFor(author, me.id)} />
              <div className={styles.grow}>
                <div className={styles.msgHead}>
                  <span className={styles.strong}>{author.name}</span>
                  <span className={styles.meta}>{m.when}</span>
                </div>
                <div className={styles.msgText}>{m.body}</div>
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
      <form
        className={styles.chatForm}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className={styles.grow}>
          <span className="sr-only">Zpráva pro celou třídu</span>
          <input
            type="text"
            placeholder="Zpráva pro celou třídu…"
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            className={styles.composerInput}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={sending || !draft.trim()}>
          <Icon name="send" size={18} />
          Odeslat
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
