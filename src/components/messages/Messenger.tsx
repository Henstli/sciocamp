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
import { applyReaction, deletedLabel, editableText, messageSnippet } from "@/lib/chat";
import { applyUpdate, deleteChatMessage, editChatMessage, markDeleted, pinChatMessage, setReaction, useChatLive } from "@/lib/chat-client";
import { ComposerContext, DeletedNote, MessageTools, PinnedBar, Reactions, ReplyQuote, messageDomId } from "../chat/ChatBits";
import chatStyles from "../chat/chat.module.css";
import { Avatar, profileHref } from "../PageHeader";
import { markConversationRead, startConversation } from "@/lib/actions/communication";
import { plural } from "@/lib/format";
import { useIsOnline, useOnlineCount } from "@/lib/presence";
import { createClient } from "@/lib/supabase/client";
import { formatClock, formatDayLabel } from "@/lib/time";
import type { ChatMeta, ChatPoll, Role, SubmissionFile } from "@/lib/types";
import { useStickToBottom } from "@/lib/use-stick-to-bottom";
import { isCompressibleImage } from "@/lib/image-compress";
import { tooBigMessage, uploadFilesDetailed, uploadLimit } from "@/lib/upload";
import { GroupPanel, NewGroupForm } from "./GroupPanel";
import { PollCard, PollComposer } from "./Poll";
import { closePoll, createPoll, usePollLive, votePoll } from "@/lib/poll-client";
import { applyVote, myChoices, setMyVotes } from "@/lib/polls";
import styles from "./messages.module.css";

const BUCKET = "zpravy";

export type ContactView = { id: string; name: string; initials: string; role: Role; caption: string };
export type ConversationView = {
  id: string;
  /** Druhý člověk (u skupiny null) */
  person: ContactView | null;
  group: { title: string; initials: string; memberCount: number; school?: boolean } | null;
  time: string;
  preview: string;
  unread: number;
};
export type GroupMemberView = ContactView & { isAdmin: boolean; me: boolean };
export type GroupView = {
  id: string;
  title: string;
  initials: string;
  meAdmin: boolean;
  members: GroupMemberView[];
  /** Celoškolní chat (nejde opustit, připínají a moderují vyučující a admin) */
  school?: boolean;
};
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
  /** Anketa (jen ve skupinách) */
  poll?: ChatPoll | null;
} & ChatMeta;

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
  reply_to?: string | null;
};

/** Aktuální čas v ms (mimo komponentu, ať ho kompilátor Reactu nepovažuje za volání při vykreslení). */
function nowMs() {
  return Date.now();
}

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
  /** `staff` = vyučující nebo admin (moderuje celoškolní chat) */
  me: { id: string; initials: string; staff?: boolean };
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
  /** Odpovídám na zprávu (id) */
  const [replyTo, setReplyTo] = useState<string | null>(null);
  /** Upravuji svou zprávu (id) */
  const [editing, setEditing] = useState<string | null>(null);
  const isOpen = !!(activePerson || activeGroup);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSentAt = useRef(0);
  const typingChannel = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  /** Formulář nové ankety (jen ve skupině) */
  const [pollOpen, setPollOpen] = useState(false);
  const [pollBusy, setPollBusy] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  /** Ankety, které přišly živě dřív než jejich zpráva (id zprávy → anketa) */
  const pendingPolls = useRef(new Map<string, ChatPoll>());
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
                    replyTo: r.reply_to ?? null,
                    poll: pendingPolls.current.get(r.id) ?? null,
                    reactions: [],
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

  const byId = new Map(messages.map((m) => [m.id, m]));
  const patch = (id: string, change: (m: ThreadMessage) => ThreadMessage) => setMessages((ms) => ms.map((m) => (m.id === id ? change(m) : m)));
  const nameOf = (id: string) => (id === me.id ? "Ty" : authorOf(id).authorName);

  // Úpravy, připnutí, smazání a reakce naživo.
  useChatLive("zpravy", convId, live, {
    onUpdate: (u) => patch(u.id, (m) => applyUpdate(m, u)),
    onDelete: (id) => {
      if (byId.has(id)) setMessages((m) => m.filter((x) => x.id !== id));
    },
    onReaction: (id, emoji, userId, add) => patch(id, (m) => ({ ...m, reactions: applyReaction(m.reactions, emoji, userId, add) })),
  });

  async function remove(id: string) {
    if (editing === id) cancelContext();
    if (live) {
      const res = await deleteChatMessage("zpravy", id);
      if (res.error) return setError(res.error);
    }
    if (replyTo === id) setReplyTo(null);
    patch(id, (m) => markDeleted(m, me.id));
    if (live) router.refresh();
  }

  async function react(m: ThreadMessage, emoji: string, add: boolean) {
    patch(m.id, (x) => ({ ...x, reactions: applyReaction(x.reactions, emoji, me.id, add) }));
    if (!live) return;
    const res = await setReaction("zpravy", m.id, emoji, add, me.id);
    if (res.error) {
      patch(m.id, (x) => ({ ...x, reactions: applyReaction(x.reactions, emoji, me.id, !add) }));
      setError(res.error);
    }
  }

  async function pin(m: ThreadMessage) {
    const pinned = !m.pinnedAt;
    const before = { pinnedAt: m.pinnedAt, pinnedBy: m.pinnedBy };
    patch(m.id, (x) => ({ ...x, pinnedAt: pinned ? new Date().toISOString() : null, pinnedBy: pinned ? me.id : null }));
    if (!live) return;
    const res = await pinChatMessage("zpravy", m.id, pinned);
    if (res.error) {
      patch(m.id, (x) => ({ ...x, ...before }));
      setError(res.error);
    }
  }

  function startReply(m: ThreadMessage) {
    setEditing(null);
    setReplyTo(m.id);
    draftInput.current?.focus();
  }

  function startEdit(m: ThreadMessage) {
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
    if (live) {
      setSending(true);
      const res = await editChatMessage("zpravy", m.id, body);
      setSending(false);
      if (res.error) return setError(res.error);
      patch(m.id, (x) => ({ ...x, body, editedAt: res.editedAt ?? new Date().toISOString() }));
      router.refresh();
    } else {
      patch(m.id, (x) => ({ ...x, body, editedAt: new Date().toISOString() }));
    }
    setEditing(null);
    setDraft("");
  }

  /** Pošle druhému „píšu“ (nejvýš jednou za 2 s), nebo „přestal jsem“. */
  const signalTyping = (stop = false) => {
    const ch = typingChannel.current;
    if (!ch) return;
    const now = nowMs();
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
  // Ankety ostatních, hlasy a ukončení naživo.
  usePollLive(convId, live && !!activeGroup, {
    onPoll: (messageId, poll) => {
      if (byId.has(messageId)) patch(messageId, (m) => ({ ...m, poll }));
      else pendingPolls.current.set(messageId, poll);
    },
    onVote: (pollId, optionId, userId, add) =>
      setMessages((ms) =>
        ms.map((m) =>
          m.poll && (pollId ? m.poll.id === pollId : m.poll.options.some((o) => o.id === optionId)) ? { ...m, poll: applyVote(m.poll, optionId, userId, add) } : m,
        ),
      ),
    onClosed: (pollId, closedAt) => setMessages((ms) => ms.map((m) => (m.poll?.id === pollId ? { ...m, poll: { ...m.poll, closedAt } } : m))),
  });

  async function vote(m: ThreadMessage, choices: string[]) {
    if (!m.poll) return;
    const before = myChoices(m.poll, me.id);
    patch(m.id, (x) => (x.poll ? { ...x, poll: setMyVotes(x.poll, me.id, choices) } : x));
    if (!live) return;
    const res = await votePoll(m.poll.id, choices);
    if (res.error) {
      patch(m.id, (x) => (x.poll ? { ...x, poll: setMyVotes(x.poll, me.id, before) } : x));
      setError(res.error);
    }
  }

  async function togglePoll(m: ThreadMessage, closed: boolean) {
    if (!m.poll) return;
    const before = m.poll.closedAt;
    patch(m.id, (x) => (x.poll ? { ...x, poll: { ...x.poll, closedAt: closed ? new Date().toISOString() : null } } : x));
    if (!live) return;
    const res = await closePoll(m.poll.id, closed);
    if (res.error) {
      patch(m.id, (x) => (x.poll ? { ...x, poll: { ...x.poll, closedAt: before } } : x));
      setError(res.error);
    }
  }

  async function newPoll(question: string, options: string[], multiple: boolean) {
    if (!activeGroup) return;
    setPollError(null);
    stickToBottom();
    const base = {
      mine: true,
      authorId: me.id,
      authorName: "Ty",
      authorInitials: me.initials,
      authorRole: "student" as Role,
      body: `📊 ${question}`,
      file: null,
      time: "teď",
      day: "Dnes",
      reactions: [],
    };
    if (!live) {
      const id = `local-${messages.length}`;
      const poll: ChatPoll = {
        id: `${id}-anketa`,
        question,
        multiple,
        closedAt: null,
        authorId: me.id,
        options: options.map((label, i) => ({ id: `${id}-${i}`, label, voterIds: [] })),
      };
      setMessages((m) => [...m, { ...base, id, createdAt: new Date().toISOString(), poll }]);
      setPollOpen(false);
      return;
    }
    setPollBusy(true);
    const res = await createPoll(activeGroup.id, question, options, multiple);
    setPollBusy(false);
    if (res.error || !res.messageId) return setPollError(res.error ?? "Anketu se nepodařilo založit.");
    const createdAt = res.createdAt ?? new Date().toISOString();
    setMessages((m) =>
      m.some((x) => x.id === res.messageId)
        ? m
        : [...m, { ...base, id: res.messageId!, time: formatClock(createdAt), day: formatDayLabel(createdAt, new Date()), createdAt, poll: res.poll ?? null }],
    );
    setPollOpen(false);
    router.refresh();
  }

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
          replyTo: reply,
          reactions: [],
        },
      ]);
      clear();
      return;
    }
    if (file_ && file_.size > uploadLimit(BUCKET) && !isCompressibleImage(file_)) return setError(tooBigMessage(BUCKET));
    setSending(true);
    signalTyping(true);
    // Zpráva se ukáže hned se stavem „Odesílá se…“.
    const tempId = `odesila-${nowMs()}`;
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
        replyTo: reply,
        reactions: [],
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
          reply_to: reply,
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
  // V celoškolním chatu se stav přečtení neukazuje (je tam celá škola).
  const status = !last?.mine ? null : last.pending ? "Odesílá se…" : activeGroup?.school ? null : readStatus(last.createdAt, states, live, !!activeGroup);

  // Zprávy s oddělovači dnů
  const rows: ({ kind: "day"; label: string } | { kind: "msg"; m: ThreadMessage })[] = [];
  messages.forEach((m, i) => {
    if (i === 0 || messages[i - 1].day !== m.day) rows.push({ kind: "day", label: m.day });
    rows.push({ kind: "msg", m });
  });

  const replyTarget = (id: string) => {
    const t = byId.get(id);
    if (!t) return null;
    return { id: t.id, authorName: nameOf(t.authorId), snippet: t.deletedAt ? "smazaná zpráva" : messageSnippet(t.body, t.file?.name, 70) };
  };
  const pinnedItems = messages
    .filter((m) => m.pinnedAt && !m.system && !m.deletedAt)
    .sort((a, b) => (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? ""))
    .map((m) => ({ id: m.id, authorName: nameOf(m.authorId), snippet: messageSnippet(m.body, m.file?.name) }));
  const replying = replyTo ? byId.get(replyTo) : null;
  const editingMsg = editing ? byId.get(editing) : null;

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
                  data-school={!!c.group?.school}
                  aria-current={c.id === activeId && !creating ? "true" : undefined}
                  onClick={() => setCreating(false)}
                  scroll={false}
                >
                  {c.group ? (
                    <GroupAvatar initials={c.group.initials} size={42} school={c.group.school} />
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
                  <GroupAvatar initials={activeGroup.initials} size={42} school={activeGroup.school} />
                  <button type="button" className={styles.headButton} onClick={() => setPanel((v) => !v)} aria-expanded={panel}>
                    <span className={styles.headName}>{activeGroup.title}</span>
                    <span className={styles.headCaption}>
                      {activeGroup.school && "Všichni ve škole · "}
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
            {!(activeGroup && panel) && <PinnedBar items={pinnedItems} canUnpin={!activeGroup?.school || !!me.staff} onUnpin={(id) => { const m = byId.get(id); if (m) void pin(m); }} />}

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
                const m = r.m;
                const align = m.mine ? "end" : "start";
                const tools = !m.pending && !m.deletedAt && (
                  <MessageTools
                    align={align}
                    myReactions={(m.reactions ?? []).filter((x) => x.userIds.includes(me.id)).map((x) => x.emoji)}
                    canEdit={m.mine && !!m.body && !isGifUrl(m.body) && !m.poll}
                    canDelete={m.mine || (!!activeGroup?.school && !!me.staff)}
                    canPin={!activeGroup?.school || !!me.staff}
                    pinned={!!m.pinnedAt}
                    onReact={(e) => {
                      const has = (m.reactions ?? []).some((x) => x.emoji === e && x.userIds.includes(me.id));
                      void react(m, e, !has);
                    }}
                    onReply={() => startReply(m)}
                    onEdit={() => startEdit(m)}
                    onDelete={() => void remove(m.id)}
                    onPin={() => void pin(m)}
                  />
                );
                const content = (
                  <div className={styles.msgWrap} data-mine={m.mine}>
                    {showAuthor && <span className={styles.author}>{m.authorName}</span>}
                    {m.replyTo && !m.deletedAt && <ReplyQuote target={replyTarget(m.replyTo)} align={align} />}
                    {m.deletedAt && <DeletedNote label={deletedLabel(m.authorId, m.deletedBy, me.id, nameOf)} align={align} />}
                    {/* Lišta akcí sedí hned vedle bubliny (u mých zpráv vlevo). */}
                    {!m.deletedAt && (
                      <div className={styles.bubbleRow}>
                        {m.mine && tools}
                        <div className={styles.bubbleCol}>
                          {m.file && <Attachment bucket={BUCKET} file={m.file} live={live} />}
                          {m.poll ? (
                            <PollCard
                              poll={m.poll}
                              meId={me.id}
                              mine={m.mine}
                              canClose={m.poll.authorId === me.id || !!activeGroup?.meAdmin || (!!activeGroup?.school && !!me.staff)}
                              nameOf={nameOf}
                              onVote={(choices) => void vote(m, choices)}
                              onClose={(closed) => void togglePoll(m, closed)}
                            />
                          ) : (
                            m.body && (isGifUrl(m.body) ? <GifImage url={m.body} /> : <div className={styles.bubble}><MentionText body={m.body} meId={me.id} /></div>)
                          )}
                        </div>
                        {!m.mine && tools}
                      </div>
                    )}
                    <Reactions reactions={m.reactions} meId={me.id} nameOf={nameOf} align={align} onToggle={(e, add) => void react(m, e, add)} />
                    <div className={styles.time}>
                      {m.pinnedAt && (
                        <span className={chatStyles.pinMark}>
                          <Icon name="pushpin" size={11} /> připnuto ·{" "}
                        </span>
                      )}
                      {m.editedAt && !m.deletedAt && <span className={chatStyles.edited}>upraveno · </span>}
                      {/* U přečtené poslední zprávy stačí „Přečteno …“, čas odeslání se skryje. */}
                      {m.id === last?.id && status ? (
                        <span className={styles.status} data-seen={status.startsWith("Přečet")}>
                          {status.startsWith("Přečet") || m.pending ? status : `${m.time} · ${status}`}
                        </span>
                      ) : (
                        !m.pending && m.time
                      )}
                    </div>
                  </div>
                );
                const lineProps = { id: messageDomId(m.id), tabIndex: -1, className: `${styles.msgLine} ${chatStyles.line}` };
                if (m.mine)
                  return (
                    <div key={m.id} {...lineProps} data-mine="true">
                      {content}
                    </div>
                  );
                if (!activeGroup)
                  return (
                    <div key={m.id} {...lineProps}>
                      {content}
                    </div>
                  );
                return (
                  <div key={m.id} {...lineProps}>
                    <span className={styles.authorAvatar}>
                      {showAuthor && <Avatar presence initials={m.authorInitials} size={32} tone={tone(m.authorRole)} href={profileHref(m.authorId)} title={m.authorName} />}
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
            {activeGroup && !panel && pollOpen && (
              <PollComposer busy={pollBusy} error={pollError} onCancel={() => (setPollOpen(false), setPollError(null))} onCreate={(q, o, multi) => void newPoll(q, o, multi)} />
            )}
            {!(activeGroup && panel) && (editingMsg || replying) && (
              <div className={styles.contextWrap}>
                {editingMsg ? (
                  <ComposerContext mode="edit" title="Upravuješ zprávu" snippet={messageSnippet(editingMsg.body, editingMsg.file?.name)} onCancel={cancelContext} />
                ) : (
                  replying && (
                    <ComposerContext mode="reply" title={`Odpovídáš: ${nameOf(replying.authorId)}`} snippet={messageSnippet(replying.body, replying.file?.name)} onCancel={cancelContext} />
                  )
                )}
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
              onKeyDown={(e) => {
                if (e.key === "Escape" && !e.defaultPrevented && (replyTo || editing)) {
                  e.preventDefault();
                  cancelContext();
                }
              }}
            >
              {!editing && (
                <ComposerPlus
                  idPrefix="zpravy"
                  onFile={setFile}
                  onEmoji={(e) => setDraft((d) => insertAtCursor(draftInput.current, d, e))}
                  onGif={(url) => void send(url)}
                  onPoll={activeGroup ? () => (cancelContext(), setPollOpen(true)) : undefined}
                />
              )}
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
              <button type="submit" className={styles.send} disabled={sending || (!draft.trim() && !file)} aria-label={editing ? "Uložit úpravu" : "Odeslat"}>
                <Icon name={editing ? "tick" : "send"} size={20} />
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
export function GroupAvatar({ initials, size = 42, school = false }: { initials: string; size?: number; school?: boolean }) {
  return (
    <span className={styles.groupAvatar} data-school={school} style={{ width: size, height: size, fontSize: size >= 40 ? 13 : 11 }} aria-hidden="true">
      {school ? <Icon name="logo" size={Math.round(size / 2)} /> : initials}
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
