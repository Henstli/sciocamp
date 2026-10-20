"use client";

// Soukromé zprávy (návrh: design/Zpravy.dc.html). Vlevo konverzace a hledání
// lidí, vpravo otevřená konverzace. Naostro chodí nové zprávy živě (Realtime).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Attachment } from "../Attachment";
import { ComposerPlus, GifImage, insertAtCursor } from "../composer/ComposerPlus";
import { isGifUrl } from "../composer/gif";
import { Avatar, profileHref } from "../PageHeader";
import { markConversationRead, startConversation } from "@/lib/actions/communication";
import { createClient } from "@/lib/supabase/client";
import { formatClock, formatDayLabel } from "@/lib/time";
import type { Role, SubmissionFile } from "@/lib/types";
import { MAX_UPLOAD_BYTES, uploadFilesDetailed } from "@/lib/upload";
import styles from "./messages.module.css";

const BUCKET = "zpravy";

export type ContactView = { id: string; name: string; initials: string; role: Role; caption: string };
export type ConversationView = { id: string; person: ContactView; time: string; preview: string; unread: number };
export type ThreadMessage = {
  id: string;
  mine: boolean;
  body: string;
  file: SubmissionFile | null;
  time: string;
  day: string;
  /** ISO čas odeslání (pro Doručeno / Přečteno) */
  createdAt: string;
  /** Ještě se odesílá */
  pending?: boolean;
};
/** Kdy měl druhý člen zprávy doručené a přečtené */
export type OtherState = { deliveredAt: string; readAt: string } | null;

/** Jak dlouho po posledním signálu ukazovat, že druhý píše (ms). */
const TYPING_SHOW_MS = 4000;
/** Jak často posílat signál „píšu“ (ms). */
const TYPING_SEND_MS = 2000;

type Row = {
  id: string;
  conversation_id: string;
  author_id: string;
  body: string;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
};

function tone(role: Role) {
  return role === "student" ? ("student" as const) : ("late" as const);
}

export function Messenger({
  me,
  conversations,
  people,
  activeId,
  activePerson,
  showThreadOnMobile,
  initialMessages,
  live,
  otherState = null,
}: {
  otherState?: OtherState;
  me: { id: string; initials: string };
  conversations: ConversationView[];
  people: ContactView[];
  activeId: string | null;
  activePerson: ContactView | null;
  /** Na mobilu ukázat rovnou konverzaci (uživatel ji vybral), jinak seznam */
  showThreadOnMobile: boolean;
  initialMessages: ThreadMessage[];
  live: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convId, setConvId] = useState(activeId);
  const [other, setOther] = useState<OtherState>(otherState);
  const [typing, setTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSentAt = useRef(0);
  const typingChannel = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const listEnd = useRef<HTMLDivElement>(null);
  const draftInput = useRef<HTMLInputElement>(null);

  const unreadHere = conversations.find((c) => c.id === activeId)?.unread ?? 0;

  // Otevřená konverzace s nepřečtenými → označit jako přečtenou (obnoví i odznak v menu).
  useEffect(() => {
    if (live && activeId && unreadHere > 0) void markConversationRead(activeId);
  }, [live, activeId, unreadHere]);

  // Nové zprávy naživo: v otevřené konverzaci je přidáme, jinak obnovíme seznam.
  useEffect(() => {
    if (!live) return;
    const sb = createClient();
    let cancelled = false;
    const channel = sb.channel(`zpravy-${me.id}`).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const r = payload.new as Row;
        if (r.conversation_id === convId) {
          if (r.author_id === me.id) return;
          setTyping(false);
          setMessages((m) =>
            m.some((x) => x.id === r.id)
              ? m
              : [
                  ...m,
                  {
                    id: r.id,
                    mine: false,
                    body: r.body,
                    // Odkaz ke stažení dostane příloha po obnovení stránky.
                    file: r.file_path ? { path: r.file_path, name: r.file_name ?? "soubor", size: r.file_size } : null,
                    time: formatClock(r.created_at),
                    day: formatDayLabel(r.created_at, new Date()),
                    createdAt: r.created_at,
                  },
                ],
          );
          void markConversationRead(r.conversation_id, false);
        } else {
          router.refresh();
        }
      },
    );
    void sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) sb.realtime.setAuth(data.session.access_token);
      channel.subscribe();
    });
    return () => {
      cancelled = true;
      void sb.removeChannel(channel);
    };
  }, [live, convId, me.id, router]);

  // Stav druhého (Doručeno / Přečteno) naživo a signál „píše“ přes Realtime broadcast.
  useEffect(() => {
    if (!live || !convId) return;
    const sb = createClient();
    let cancelled = false;
    const members = sb.channel(`clenove-${convId}`).on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${convId}` },
      (payload) => {
        const r = payload.new as { user_id: string; delivered_at: string; last_read_at: string };
        if (r.user_id !== me.id) setOther({ deliveredAt: r.delivered_at, readAt: r.last_read_at });
      },
    );
    const typingCh = sb.channel(`psani-${convId}`, { config: { broadcast: { self: false } } }).on(
      "broadcast",
      { event: "typing" },
      ({ payload }) => {
        if ((payload as { userId?: string })?.userId === me.id) return;
        const stop = (payload as { stop?: boolean })?.stop;
        if (typingTimer.current) clearTimeout(typingTimer.current);
        setTyping(!stop);
        if (!stop) typingTimer.current = setTimeout(() => setTyping(false), TYPING_SHOW_MS);
      },
    );
    typingChannel.current = typingCh;
    void sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) sb.realtime.setAuth(data.session.access_token);
      members.subscribe();
      typingCh.subscribe();
    });
    return () => {
      cancelled = true;
      typingChannel.current = null;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      void sb.removeChannel(members);
      void sb.removeChannel(typingCh);
    };
  }, [live, convId, me.id]);

  /** Pošle druhému „píšu“ (nejvýš jednou za 2 s), nebo „přestal jsem“. */
  const signalTyping = (stop = false) => {
    const ch = typingChannel.current;
    if (!ch) return;
    const now = Date.now();
    if (!stop && now - typingSentAt.current < TYPING_SEND_MS) return;
    typingSentAt.current = stop ? 0 : now;
    void ch.send({ type: "broadcast", event: "typing", payload: { userId: me.id, stop } });
  };

  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: "end" });
  }, [messages.length, typing]);

  const found = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("cs");
    if (!q) return [];
    const strip = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("cs");
    const nq = strip(q);
    return people.filter((p) => strip(p.name).includes(nq)).slice(0, 12);
  }, [query, people]);

  /** Odešle rozepsanou zprávu, nebo rovnou GIF (`gif` = odkaz). */
  async function send(gif?: string) {
    const body = gif ?? draft.trim();
    const file_ = gif ? null : file;
    const clear = () => {
      if (gif) return;
      setDraft("");
      setFile(null);
    };
    if ((!body && !file_) || !activePerson) return;
    setError(null);
    if (!live) {
      setMessages((m) => [
        ...m,
        {
          id: `local-${m.length}`,
          mine: true,
          body,
          file: file_ ? { path: "", name: file_.name, size: file_.size } : null,
          time: "teď",
          day: "Dnes",
          createdAt: new Date().toISOString(),
        },
      ]);
      clear();
      return;
    }
    if (file_ && file_.size > MAX_UPLOAD_BYTES) return setError("Soubor je větší než 25 MB. Nahraj ho na Google Disk a pošli odkaz.");
    setSending(true);
    signalTyping(true);
    // Zpráva se ukáže hned se stavem „Odesílá se…“.
    const tempId = `odesila-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: tempId, mine: true, body, file: file_ ? { path: "", name: file_.name, size: file_.size } : null, time: "", day: "Dnes", createdAt: new Date().toISOString(), pending: true },
    ]);
    const dropPending = () => setMessages((m) => m.filter((x) => x.id !== tempId));
    try {
      let id = convId;
      if (!id) {
        const res = await startConversation(activePerson.id);
        if (res.error || !res.id) {
          dropPending();
          return setError(res.error ?? "Konverzaci se nepodařilo založit.");
        }
        id = res.id;
        setConvId(id);
      }
      let attached: { path: string; name: string; size: number } | null = null;
      if (file_) {
        const { problem, uploaded } = await uploadFilesDetailed(BUCKET, id, [file_]);
        if (problem || !uploaded[0]) {
          dropPending();
          return setError(problem ?? "Přílohu se nepodařilo nahrát.");
        }
        attached = uploaded[0];
      }
      const { data, error: err } = await createClient()
        .from("messages")
        .insert({
          conversation_id: id,
          body,
          file_path: attached?.path ?? null,
          file_name: attached?.name ?? null,
          file_size: attached?.size ?? null,
        })
        .select("id, created_at")
        .single();
      if (err || !data) {
        dropPending();
        return setError("Zprávu se nepodařilo odeslat. Zkus to znovu.");
      }
      setMessages((m) =>
        m.map((x) =>
          x.id === tempId
            ? {
                id: data.id,
                mine: true,
                body,
                file: attached ? { ...attached } : null,
                time: formatClock(data.created_at),
                day: formatDayLabel(data.created_at, new Date()),
                createdAt: data.created_at,
              }
            : x,
        ),
      );
      clear();
      if (!activeId) router.replace(`/zpravy?k=${id}`, { scroll: false });
      else router.refresh();
    } finally {
      setSending(false);
    }
  }

  // Stav poslední zprávy, pokud je moje: Odesílá se / Odesláno / Doručeno / Přečteno.
  const last = messages.at(-1);
  const status = !last?.mine
    ? null
    : last.pending
      ? "Odesílá se…"
      : !live && !other
        ? null
        : other && last.createdAt <= other.readAt
          ? `Přečteno ${formatClock(other.readAt)}`
          : other && last.createdAt <= other.deliveredAt
            ? "Doručeno"
            : "Odesláno";

  // Zprávy s oddělovači dnů
  const rows: ({ kind: "day"; label: string } | { kind: "msg"; m: ThreadMessage })[] = [];
  messages.forEach((m, i) => {
    if (i === 0 || messages[i - 1].day !== m.day) rows.push({ kind: "day", label: m.day });
    rows.push({ kind: "msg", m });
  });

  return (
    <div className={`card ${styles.shell}`} data-thread={showThreadOnMobile && !!activePerson}>
      <aside className={styles.side} aria-label="Konverzace">
        <label className={styles.search}>
          <Icon name="search" size={18} />
          <span className="sr-only">Hledat lidi</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hledat lidi…" type="search" />
        </label>

        {query.trim() ? (
          <ul className={styles.list}>
            {found.length === 0 && <li className={styles.empty}>Nikoho takového nenacházím.</li>}
            {found.map((p) => (
              <li key={p.id}>
                <Link href={`/zpravy?s=${p.id}`} className={styles.row} onClick={() => setQuery("")} scroll={false}>
                  <Avatar initials={p.initials} userId={p.id} size={42} tone={tone(p.role)} />
                  <span className={styles.rowMain}>
                    <span className={styles.rowName}>{p.name}</span>
                    <span className={styles.rowPreview}>{p.caption}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <ul className={styles.list}>
            {conversations.length === 0 && (
              <li className={styles.empty}>Zatím tu nic není. Najdi spolužáka nebo vyučujícího v hledání nahoře a napiš mu.</li>
            )}
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/zpravy?k=${c.id}`}
                  className={styles.row}
                  aria-current={c.id === activeId ? "true" : undefined}
                  scroll={false}
                >
                  <Avatar initials={c.person.initials} userId={c.person.id} size={42} tone={tone(c.person.role)} />
                  <span className={styles.rowMain}>
                    <span className={styles.rowTop}>
                      <span className={styles.rowName}>{c.person.name}</span>
                      <span className={styles.rowTime}>{c.time}</span>
                    </span>
                    <span className={styles.rowBottom}>
                      <span className={styles.rowPreview} data-unread={c.unread > 0}>
                        {c.preview}
                      </span>
                      {c.unread > 0 && (
                        <span className={styles.badge} aria-label={`${c.unread} nepřečtené`}>
                          {c.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className={styles.thread} aria-label={activePerson ? `Konverzace: ${activePerson.name}` : "Konverzace"}>
        {activePerson ? (
          <>
            <header className={styles.threadHead}>
              <Link href="/zpravy" className={styles.back} aria-label="Zpět na seznam">
                <Icon name="chevronLeft" size={20} />
              </Link>
              <Avatar initials={activePerson.initials} size={42} tone={tone(activePerson.role)} href={profileHref(activePerson.id)} title={activePerson.name} />
              <div>
                <div className={styles.headName}>{activePerson.name}</div>
                <div className={styles.headCaption}>{activePerson.caption}</div>
              </div>
            </header>

            <div className={styles.messages} aria-live="polite">
              {rows.length === 0 && <p className={styles.emptyThread}>Napiš první zprávu.</p>}
              {rows.map((r, i) =>
                r.kind === "day" ? (
                  <div key={`d-${i}`} className={styles.day}>
                    <span>{r.label}</span>
                  </div>
                ) : (
                  <div key={r.m.id} className={styles.msgWrap} data-mine={r.m.mine}>
                    {r.m.file && <Attachment bucket={BUCKET} file={r.m.file} live={live} />}
                    {r.m.body && (isGifUrl(r.m.body) ? <GifImage url={r.m.body} /> : <div className={styles.bubble}>{r.m.body}</div>)}
                    <div className={styles.time}>
                      {/* U přečtené poslední zprávy stačí „Přečteno hh:mm“, čas odeslání se skryje. */}
                      {r.m.id === last?.id && status ? (
                        <span className={styles.status} data-seen={status.startsWith("Přečteno")}>
                          {status.startsWith("Přečteno") || r.m.pending ? status : `${r.m.time} · ${status}`}
                        </span>
                      ) : (
                        !r.m.pending && r.m.time
                      )}
                    </div>
                  </div>
                ),
              )}
              {typing && (
                <div className={styles.msgWrap} data-mine="false">
                  <div className={`${styles.bubble} ${styles.typing}`} aria-label={`${activePerson.name} píše`}>
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}
              <div ref={listEnd} />
            </div>

            {file && (
              <div className={styles.pending}>
                <Icon name="file" size={16} />
                <span>{file.name}</span>
                <button type="button" onClick={() => setFile(null)} aria-label="Odebrat přílohu" className={styles.pendingRemove}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            )}
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            <form
              className={styles.composer}
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <ComposerPlus
                idPrefix="zpravy"
                onFile={setFile}
                onEmoji={(e) => setDraft((d) => insertAtCursor(draftInput.current, d, e))}
                onGif={(url) => void send(url)}
              />
              <label className={styles.grow}>
                <span className="sr-only">Zpráva</span>
                <input
                  ref={draftInput}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    signalTyping(e.target.value.trim() === "");
                  }}
                  maxLength={4000}
                  placeholder="Napiš zprávu…"
                  className={styles.input}
                />
              </label>
              <button type="submit" className={styles.send} disabled={sending || (!draft.trim() && !file)} aria-label="Odeslat">
                <Icon name="send" size={20} />
              </button>
            </form>
            {!live && <p className={styles.note}>Ukázkový režim: zprávy se neukládají.</p>}
          </>
        ) : (
          <div className={styles.placeholder}>
            <Icon name="chat" size={32} />
            <p>Vyber konverzaci vlevo, nebo najdi člověka v hledání a napiš mu.</p>
          </div>
        )}
      </section>
    </div>
  );
}
