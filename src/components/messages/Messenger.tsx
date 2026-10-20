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
import { MentionInput } from "../composer/MentionInput";
import { MentionText } from "../composer/MentionText";
import { encodeMentions } from "@/lib/mentions";
import { Avatar, profileHref } from "../PageHeader";
import { markConversationRead, startConversation } from "@/lib/actions/communication";
import { plural } from "@/lib/format";
import { useIsOnline, useOnlineCount } from "@/lib/presence";
import { createClient } from "@/lib/supabase/client";
import { formatClock, formatDayLabel } from "@/lib/time";
import type { Role, SubmissionFile } from "@/lib/types";
import { useStickToBottom } from "@/lib/use-stick-to-bottom";
import { isCompressibleImage } from "@/lib/image-compress";
import { tooBigMessage, uploadFilesDetailed, uploadLimit } from "@/lib/upload";
import { GroupPanel, NewGroupForm } from "./GroupPanel";
import styles from "./messages.module.css";

const BUCKET = "zpravy";

export type ContactView = { id: string; name: string; initials: string; role: Role; caption: string };
export type ConversationView = {
  id: string;
  /** Druhý člověk (u skupiny null) */
  person: ContactView | null;
  group: { title: string; initials: string; memberCount: number } | null;
  time: string;
  preview: string;
  unread: number;
};
export type GroupMemberView = ContactView & { isAdmin: boolean; me: boolean };
export type GroupView = { id: string; title: string; initials: string; meAdmin: boolean; members: GroupMemberView[] };
export type MemberState = { userId: string; deliveredAt: string; readAt: string };
export type ThreadMessage = {
  id: string;
  mine: boolean;
  authorId: string;
  authorName: string;
  authorInitials: string;
  authorRole: Role;
  /** Systémová zpráva skupiny („X opustil(a) skupinu“) */
  system?: boolean;
  body: string;
  file: SubmissionFile | null;
  time: string;
  day: string;
  /** ISO čas odeslání (pro Doručeno / Přečteno) */
  createdAt: string;
  /** Ještě se odesílá */
  pending?: boolean;
};

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
  system?: boolean;
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
  activeGroup = null,
  showThreadOnMobile,
  initialMessages,
  live,
  memberStates = [],
}: {
  /** Stav ostatních členů (Doručeno / Přečteno) */
  memberStates?: MemberState[];
  me: { id: string; initials: string };
  conversations: ConversationView[];
  people: ContactView[];
  activeId: string | null;
  /** Otevřená konverzace s jedním člověkem */
  activePerson: ContactView | null;
  /** Otevřená skupina */
  activeGroup?: GroupView | null;
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
  const [states, setStates] = useState<MemberState[]>(memberStates);
  /** Kdo právě píše (id), nebo null */
  const [typing, setTyping] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [panel, setPanel] = useState(false);
  const isOpen = !!(activePerson || activeGroup);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSentAt = useRef(0);
  const typingChannel = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  const stickToBottom = useStickToBottom(thread, activeId ?? activePerson?.id ?? null);

  // Koho jde v konverzaci zmínit přes @ (členové skupiny, u dvojice ten druhý).
  const mentionable = activeGroup
    ? activeGroup.members.filter((m) => !m.me && m.id)
    : activePerson
      ? [activePerson]
      : [];

  /** Jméno a iniciály autora zprávy, která přišla živě. */
  const authorOf = (id: string) => {
    const p = activeGroup?.members.find((x) => x.id === id) ?? people.find((x) => x.id === id) ?? (activePerson?.id === id ? activePerson : null);
    return { authorName: p?.name ?? "Člen skupiny", authorInitials: p?.initials ?? "?", authorRole: p?.role ?? ("student" as Role) };
  };
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
          // Změna ve skupině (přidání, odchod, nový název) → načíst znovu členy a název.
          if (r.system) {
            router.refresh();
            return;
          }
          if (r.author_id === me.id) return;
          setTyping(null);
          setMessages((m) =>
            m.some((x) => x.id === r.id)
              ? m
              : [
                  ...m,
                  {
                    id: r.id,
                    mine: false,
                    authorId: r.author_id,
                    ...authorOf(r.author_id),
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
    // authorOf se mění s každým vykreslením; kanál stačí navázat podle konverzace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        if (r.user_id === me.id) return;
        const next = { userId: r.user_id, deliveredAt: r.delivered_at, readAt: r.last_read_at };
        setStates((list) => (list.some((x) => x.userId === r.user_id) ? list.map((x) => (x.userId === r.user_id ? next : x)) : [...list, next]));
      },
    );
    const typingCh = sb.channel(`psani-${convId}`, { config: { broadcast: { self: false } } }).on(
      "broadcast",
      { event: "typing" },
      ({ payload }) => {
        const who = (payload as { userId?: string })?.userId;
        if (!who || who === me.id) return;
        const stop = (payload as { stop?: boolean })?.stop;
        if (typingTimer.current) clearTimeout(typingTimer.current);
        setTyping(stop ? null : who);
        if (!stop) typingTimer.current = setTimeout(() => setTyping(null), TYPING_SHOW_MS);
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

  const found = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("cs");
    if (!q) return [];
    const strip = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("cs");
    const nq = strip(q);
    return people.filter((p) => strip(p.name).includes(nq)).slice(0, 12);
  }, [query, people]);

  /** Odešle rozepsanou zprávu, nebo rovnou GIF (`gif` = odkaz). */
  async function send(gif?: string) {
    stickToBottom();
    const body = gif ?? encodeMentions(draft.trim(), mentionable);
    const file_ = gif ? null : file;
    const clear = () => {
      if (gif) return;
      setDraft("");
      setFile(null);
    };
    if ((!body && !file_) || !isOpen) return;
    setError(null);
    if (!live) {
      setMessages((m) => [
        ...m,
        {
          id: `local-${m.length}`,
          mine: true,
          authorId: me.id,
          authorName: "Ty",
          authorInitials: me.initials,
          authorRole: "student",
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
    if (file_ && file_.size > uploadLimit(BUCKET) && !isCompressibleImage(file_)) return setError(tooBigMessage(BUCKET));
    setSending(true);
    signalTyping(true);
    // Zpráva se ukáže hned se stavem „Odesílá se…“.
    const tempId = `odesila-${Date.now()}`;
    setMessages((m) => [
      ...m,
      {
        id: tempId,
        mine: true,
        authorId: me.id,
        authorName: "Ty",
        authorInitials: me.initials,
        authorRole: "student",
        body,
        file: file_ ? { path: "", name: file_.name, size: file_.size } : null,
        time: "",
        day: "Dnes",
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ]);
    const dropPending = () => setMessages((m) => m.filter((x) => x.id !== tempId));
    try {
      let id = convId;
      if (!id) {
        if (!activePerson) return dropPending();
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
        // Třeba tě mezitím někdo ze skupiny odebral — obnovit seznam.
        if (activeGroup) router.refresh();
        return setError("Zprávu se nepodařilo odeslat. Zkus to znovu.");
      }
      setMessages((m) =>
        m.map((x) =>
          x.id === tempId
            ? {
                ...x,
                id: data.id,
                pending: undefined,
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
  const last = messages.filter((m) => !m.system).at(-1);
  const status = !last?.mine ? null : last.pending ? "Odesílá se…" : readStatus(last.createdAt, states, live, !!activeGroup);

  // Zprávy s oddělovači dnů
  const rows: ({ kind: "day"; label: string } | { kind: "msg"; m: ThreadMessage })[] = [];
  messages.forEach((m, i) => {
    if (i === 0 || messages[i - 1].day !== m.day) rows.push({ kind: "day", label: m.day });
    rows.push({ kind: "msg", m });
  });

  const typingName = typing ? (authorOf(typing).authorName.split(" ")[0] ?? "") : "";
  const threadLabel = activeGroup ? activeGroup.title : activePerson?.name;

  return (
    <div className={`card ${styles.shell}`} data-thread={(showThreadOnMobile && isOpen) || creating}>
      <aside className={styles.side} aria-label="Konverzace">
        <div className={styles.sideTop}>
          <label className={styles.search}>
            <Icon name="search" size={18} />
            <span className="sr-only">Hledat lidi</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hledat lidi…" type="search" />
          </label>
          <button type="button" className={styles.newGroup} onClick={() => setCreating(true)} aria-label="Nová skupina" title="Nová skupina">
            <Icon name="users" size={20} />
          </button>
        </div>

        {query.trim() ? (
          <ul className={styles.list}>
            {found.length === 0 && <li className={styles.empty}>Nikoho takového nenacházím.</li>}
            {found.map((p) => (
              <li key={p.id}>
                <Link href={`/zpravy?s=${p.id}`} className={styles.row} onClick={() => setQuery("")} scroll={false}>
                  <Avatar presence initials={p.initials} userId={p.id} size={42} tone={tone(p.role)} />
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
              <li className={styles.empty}>Zatím tu nic není. Najdi spolužáka nebo vyučujícího v hledání nahoře a napiš mu, nebo založ skupinu.</li>
            )}
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/zpravy?k=${c.id}`}
                  className={styles.row}
                  aria-current={c.id === activeId && !creating ? "true" : undefined}
                  onClick={() => setCreating(false)}
                  scroll={false}
                >
                  {c.group ? (
                    <GroupAvatar initials={c.group.initials} size={42} />
                  ) : (
                    <Avatar presence initials={c.person!.initials} userId={c.person!.id} size={42} tone={tone(c.person!.role)} />
                  )}
                  <span className={styles.rowMain}>
                    <span className={styles.rowTop}>
                      <span className={styles.rowName}>{c.group ? c.group.title : c.person!.name}</span>
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

      <section className={styles.thread} aria-label={creating ? "Nová skupina" : threadLabel ? `Konverzace: ${threadLabel}` : "Konverzace"}>
        {creating ? (
          <NewGroupForm people={people} live={live} onCancel={() => setCreating(false)} />
        ) : isOpen ? (
          <>
            <header className={styles.threadHead}>
              <Link href="/zpravy" className={styles.back} aria-label="Zpět na seznam">
                <Icon name="chevronLeft" size={20} />
              </Link>
              {activeGroup ? (
                <>
                  <GroupAvatar initials={activeGroup.initials} size={42} />
                  <button type="button" className={styles.headButton} onClick={() => setPanel((v) => !v)} aria-expanded={panel}>
                    <span className={styles.headName}>{activeGroup.title}</span>
                    <span className={styles.headCaption}>
                      {activeGroup.members.length} {plural(activeGroup.members.length, "člen", "členové", "členů")}
                      <GroupOnline ids={activeGroup.members.filter((m) => !m.me).map((m) => m.id)} /> · {panel ? "zpět do chatu" : "zobrazit členy"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.headIcon}
                    onClick={() => setPanel((v) => !v)}
                    aria-label={panel ? "Zpět do chatu" : "Členové skupiny"}
                    title={panel ? "Zpět do chatu" : "Členové skupiny"}
                    aria-expanded={panel}
                  >
                    <Icon name={panel ? "close" : "users"} size={20} />
                  </button>
                </>
              ) : (
                activePerson && (
                  <>
                    <Avatar presence initials={activePerson.initials} size={42} tone={tone(activePerson.role)} href={profileHref(activePerson.id)} title={activePerson.name} />
                    <div>
                      <div className={styles.headName}>{activePerson.name}</div>
                      <PersonCaption id={activePerson.id} caption={activePerson.caption} />
                    </div>
                  </>
                )
              )}
            </header>

            {activeGroup && panel && <GroupPanel group={activeGroup} people={people} live={live} />}

            <div className={styles.messages} aria-live="polite" ref={thread} hidden={!!activeGroup && panel}>
              {rows.length === 0 && <p className={styles.emptyThread}>Napiš první zprávu.</p>}
              {rows.map((r, i) => {
                if (r.kind === "day") {
                  return (
                    <div key={`d-${i}`} className={styles.day}>
                      <span>{r.label}</span>
                    </div>
                  );
                }
                if (r.m.system) {
                  return (
                    <p key={r.m.id} className={styles.system}>
                      {r.m.body}
                    </p>
                  );
                }
                const prev = rows[i - 1];
                // Ve skupině u cizích zpráv jméno a avatar, když se změní autor.
                const showAuthor = !!activeGroup && !r.m.mine && !(prev?.kind === "msg" && !prev.m.system && prev.m.authorId === r.m.authorId);
                const content = (
                  <div className={styles.msgWrap} data-mine={r.m.mine}>
                    {showAuthor && <span className={styles.author}>{r.m.authorName}</span>}
                    {r.m.file && <Attachment bucket={BUCKET} file={r.m.file} live={live} />}
                    {r.m.body && (isGifUrl(r.m.body) ? <GifImage url={r.m.body} /> : <div className={styles.bubble}><MentionText body={r.m.body} meId={me.id} /></div>)}
                    <div className={styles.time}>
                      {/* U přečtené poslední zprávy stačí „Přečteno …“, čas odeslání se skryje. */}
                      {r.m.id === last?.id && status ? (
                        <span className={styles.status} data-seen={status.startsWith("Přečet")}>
                          {status.startsWith("Přečet") || r.m.pending ? status : `${r.m.time} · ${status}`}
                        </span>
                      ) : (
                        !r.m.pending && r.m.time
                      )}
                    </div>
                  </div>
                );
                if (!activeGroup || r.m.mine) return <div key={r.m.id} className={styles.msgLine} data-mine={r.m.mine}>{content}</div>;
                return (
                  <div key={r.m.id} className={styles.msgLine}>
                    <span className={styles.authorAvatar}>
                      {showAuthor && <Avatar presence initials={r.m.authorInitials} size={32} tone={tone(r.m.authorRole)} href={profileHref(r.m.authorId)} title={r.m.authorName} />}
                    </span>
                    {content}
                  </div>
                );
              })}
              {typing && (
                <div className={styles.msgLine}>
                  <div className={styles.msgWrap} data-mine="false">
                    {activeGroup && <span className={styles.author}>{typingName} píše…</span>}
                    <div className={`${styles.bubble} ${styles.typing}`} aria-label={`${typingName || threadLabel} píše`}>
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              )}
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
              hidden={!!activeGroup && panel}
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
                <MentionInput
                  inputRef={draftInput}
                  value={draft}
                  onChange={(v) => {
                    setDraft(v);
                    signalTyping(v.trim() === "");
                  }}
                  people={mentionable}
                  maxLength={4000}
                  placeholder={activeGroup ? "Napiš zprávu… (@ zmíní člena)" : "Napiš zprávu…"}
                  className={styles.input}
                />
              </label>
              <button type="submit" className={styles.send} disabled={sending || (!draft.trim() && !file)} aria-label="Odeslat">
                <Icon name="send" size={20} />
              </button>
            </form>
            {!live && !(activeGroup && panel) && <p className={styles.note}>Ukázkový režim: zprávy se neukládají.</p>}
          </>
        ) : (
          <div className={styles.placeholder}>
            <Icon name="chat" size={32} />
            <p>Vyber konverzaci vlevo, najdi člověka v hledání a napiš mu, nebo založ skupinu.</p>
          </div>
        )}
      </section>
    </div>
  );
}

/** Pod jménem v hlavičce: „Online“, jinak role. */
function PersonCaption({ id, caption }: { id: string; caption: string }) {
  const online = useIsOnline(id);
  return online ? <div className={`${styles.headCaption} ${styles.online}`}>Online</div> : <div className={styles.headCaption}>{caption}</div>;
}

/** „ · 2 online“ u skupiny (bez mě). */
function GroupOnline({ ids }: { ids: string[] }) {
  const n = useOnlineCount(ids);
  return n > 0 ? <span className={styles.online}> · {n} online</span> : null;
}

/** Kulaté logo skupiny s iniciálami názvu. */
export function GroupAvatar({ initials, size = 42 }: { initials: string; size?: number }) {
  return (
    <span className={styles.groupAvatar} style={{ width: size, height: size, fontSize: size >= 40 ? 13 : 11 }} aria-hidden="true">
      {initials}
    </span>
  );
}

/**
 * Stav mojí poslední zprávy. U dvojice Odesláno / Doručeno / Přečteno hh:mm,
 * ve skupině „Přečetli všichni“ nebo „Přečetl(o) 2 z 5“.
 */
function readStatus(sentAt: string, states: MemberState[], live: boolean, group: boolean): string | null {
  if (states.length === 0) return live ? "Odesláno" : null;
  const read = states.filter((x) => sentAt <= x.readAt);
  if (!group) {
    const o = states[0];
    if (sentAt <= o.readAt) return `Přečteno ${formatClock(o.readAt)}`;
    return sentAt <= o.deliveredAt ? "Doručeno" : "Odesláno";
  }
  if (read.length === states.length) return "Přečetli všichni";
  if (read.length > 0) return `Přečetlo ${read.length} z ${states.length}`;
  return states.every((x) => sentAt <= x.deliveredAt) ? "Doručeno" : "Odesláno";
}
