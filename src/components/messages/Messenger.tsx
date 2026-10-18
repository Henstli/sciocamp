"use client";

// Soukromé zprávy (návrh: design/Zpravy.dc.html). Vlevo konverzace a hledání
// lidí, vpravo otevřená konverzace. Naostro chodí nové zprávy živě (Realtime).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Attachment } from "../Attachment";
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
export type ThreadMessage = { id: string; mine: boolean; body: string; file: SubmissionFile | null; time: string; day: string };

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
}: {
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
  const listEnd = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const found = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("cs");
    if (!q) return [];
    const strip = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("cs");
    const nq = strip(q);
    return people.filter((p) => strip(p.name).includes(nq)).slice(0, 12);
  }, [query, people]);

  async function send() {
    const body = draft.trim();
    if ((!body && !file) || !activePerson) return;
    setError(null);
    if (!live) {
      setMessages((m) => [
        ...m,
        {
          id: `local-${m.length}`,
          mine: true,
          body,
          file: file ? { path: "", name: file.name, size: file.size } : null,
          time: "teď",
          day: "Dnes",
        },
      ]);
      setDraft("");
      setFile(null);
      return;
    }
    if (file && file.size > MAX_UPLOAD_BYTES) return setError("Soubor je větší než 25 MB. Nahraj ho na Google Disk a pošli odkaz.");
    setSending(true);
    try {
      let id = convId;
      if (!id) {
        const res = await startConversation(activePerson.id);
        if (res.error || !res.id) return setError(res.error ?? "Konverzaci se nepodařilo založit.");
        id = res.id;
        setConvId(id);
      }
      let attached: { path: string; name: string; size: number } | null = null;
      if (file) {
        const { problem, uploaded } = await uploadFilesDetailed(BUCKET, id, [file]);
        if (problem || !uploaded[0]) return setError(problem ?? "Přílohu se nepodařilo nahrát.");
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
      if (err || !data) return setError("Zprávu se nepodařilo odeslat. Zkus to znovu.");
      setMessages((m) => [
        ...m,
        {
          id: data.id,
          mine: true,
          body,
          file: attached ? { ...attached } : null,
          time: formatClock(data.created_at),
          day: formatDayLabel(data.created_at, new Date()),
        },
      ]);
      setDraft("");
      setFile(null);
      if (!activeId) router.replace(`/zpravy?k=${id}`, { scroll: false });
      else router.refresh();
    } finally {
      setSending(false);
    }
  }

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
                  <Avatar initials={p.initials} size={42} tone={tone(p.role)} />
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
                  <Avatar initials={c.person.initials} size={42} tone={tone(c.person.role)} />
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
                    {r.m.body && <div className={styles.bubble}>{r.m.body}</div>}
                    <div className={styles.time}>{r.m.time}</div>
                  </div>
                ),
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
              <input
                ref={fileInput}
                type="file"
                id="priloha-zpravy"
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  if (fileInput.current) fileInput.current.value = "";
                }}
              />
              <label htmlFor="priloha-zpravy" className={styles.attach} aria-label="Přiložit soubor">
                <Icon name="paperclip" size={20} />
              </label>
              <label className={styles.grow}>
                <span className="sr-only">Zpráva</span>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
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
