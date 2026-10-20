import type { Metadata } from "next";
import { isGifUrl } from "@/components/composer/gif";
import { mentionPlain } from "@/lib/mentions";
import { Messenger, type ContactView, type ConversationView, type GroupView, type ThreadMessage } from "@/components/messages/Messenger";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { isSupabase } from "@/lib/config";
import { listUsers } from "@/lib/data";
import { conversationMembers, conversationMessages, conversationsFor } from "@/lib/data-communication";
import { plural } from "@/lib/format";
import { initials, roleCaption } from "@/lib/roles";
import { formatClock, formatDayLabel, formatListTime } from "@/lib/time";
import type { User } from "@/lib/types";

export const metadata: Metadata = { title: "Zprávy" };

const FORMER: ContactView = { id: "", name: "Bývalý člen školy", initials: "?", role: "student", caption: "" };

export default async function MessagesPage({ searchParams }: PageProps<"/zpravy">) {
  const user = await requireUser();
  const { k, s } = await searchParams;
  const [conversations, users] = await Promise.all([conversationsFor(user), listUsers()]);
  const byId = new Map(users.map((u) => [u.id, u]));
  const now = new Date();

  const contact = (u: User): ContactView => ({
    id: u.id,
    name: u.name,
    initials: initials(u.name),
    role: u.role,
    caption: roleCaption(u),
  });
  const contactOf = (id: string): ContactView => {
    const u = byId.get(id);
    return u ? contact(u) : { ...FORMER, id };
  };
  const firstName = (id: string | null) => (id ? (byId.get(id)?.name.split(" ")[0] ?? "Někdo") : "");

  const list: ConversationView[] = conversations
    .map((c): ConversationView | null => {
      // Prázdná poslední zpráva bez přílohy = smazaná.
      const text = isGifUrl(c.lastBody) ? "GIF" : mentionPlain(c.lastBody ?? "") || (c.lastHasFile ? "Příloha" : "Zpráva byla smazána");
      const time = formatListTime(c.lastAt, now);
      if (c.isGroup) {
        const preview = c.lastSystem || !c.lastAuthor ? text : `${c.lastMine ? "Ty" : firstName(c.lastAuthor)}: ${text}`;
        return {
          id: c.id,
          person: null,
          group: { title: c.title ?? "Skupina", initials: groupInitials(c.title ?? "Skupina"), memberCount: c.memberCount, school: !!c.isSchool },
          time,
          preview,
          unread: c.unread,
        };
      }
      const other = c.otherId ? byId.get(c.otherId) : undefined;
      if (!other) return null;
      return { id: c.id, person: contact(other), group: null, time, preview: c.lastMine ? `Ty: ${text}` : text, unread: c.unread };
    })
    .filter((c): c is ConversationView => !!c)
    // Celoškolní chat je vždy nahoře, ať nezapadne.
    .sort((a, b) => Number(!!b.group?.school) - Number(!!a.group?.school));

  // Která konverzace je otevřená: ?k=<id>, nebo ?s=<id člověka> (i nová, zatím bez zpráv).
  const wanted = typeof k === "string" ? list.find((c) => c.id === k) : undefined;
  const withPerson = typeof s === "string" && s !== user.id ? byId.get(s) : undefined;
  const existing = withPerson ? list.find((c) => c.person?.id === withPerson.id) : undefined;
  const active = wanted ?? existing ?? null;
  const explicit = !!(wanted || withPerson);
  const fallback = !explicit ? (list[0] ?? null) : null;
  const open = active ?? fallback;
  const activePerson = open ? open.person : withPerson ? contact(withPerson) : null;

  const members = open ? await conversationMembers(open.id) : [];
  const activeGroup: GroupView | null =
    open?.group
      ? {
          id: open.id,
          title: open.group.title,
          initials: open.group.initials,
          school: open.group.school,
          meAdmin: members.some((m) => m.userId === user.id && m.isAdmin),
          members: members
            .map((m) => ({ ...contactOf(m.userId), isAdmin: m.isAdmin, me: m.userId === user.id }))
            .sort((a, b) => Number(b.me) - Number(a.me) || Number(b.isAdmin) - Number(a.isAdmin) || a.name.localeCompare(b.name, "cs")),
        }
      : null;

  const messages: ThreadMessage[] = open
    ? (await conversationMessages(open.id)).map((m) => {
        const author = contactOf(m.authorId);
        return {
          id: m.id,
          mine: m.authorId === user.id,
          authorId: m.authorId,
          authorName: author.name,
          authorInitials: author.initials,
          authorRole: author.role,
          system: !!m.system,
          body: m.body,
          file: m.file,
          time: formatClock(m.createdAt),
          day: formatDayLabel(m.createdAt, now),
          createdAt: m.createdAt,
          replyTo: m.replyTo ?? null,
          editedAt: m.editedAt ?? null,
          pinnedAt: m.pinnedAt ?? null,
          pinnedBy: m.pinnedBy ?? null,
          reactions: m.reactions ?? [],
          deletedAt: m.deletedAt ?? null,
          deletedBy: m.deletedBy ?? null,
        };
      })
    : [];
  // Stav ostatních členů (Doručeno / Přečteno).
  const memberStates = members.filter((m) => m.userId !== user.id).map((m) => ({ userId: m.userId, deliveredAt: m.deliveredAt, readAt: m.readAt }));

  // Stejně jako číslo v menu: bez celoškolního chatu.
  const unread = list.filter((c) => !c.group?.school).reduce((n, c) => n + c.unread, 0);
  const people = users
    .filter((u) => u.id !== user.id && u.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name, "cs"))
    .map(contact);

  return (
    <>
      <PageHeader
        title="Zprávy"
        subtitle={unread > 0 ? `${unread} ${plural(unread, "nepřečtená", "nepřečtené", "nepřečtených")}` : "Soukromé zprávy a skupiny se spolužáky a vyučujícími"}
        avatar={{ initials: initials(user.name), name: user.name }}
      />
      <Messenger
        key={open?.id ?? activePerson?.id ?? "nic"}
        me={{ id: user.id, initials: initials(user.name), staff: user.role !== "student" }}
        conversations={list}
        people={people}
        activeId={open?.id ?? null}
        activePerson={activePerson}
        activeGroup={activeGroup}
        showThreadOnMobile={explicit}
        initialMessages={messages}
        live={isSupabase}
        memberStates={memberStates}
      />
    </>
  );
}

/** „Projekt Cestománie“ → „PC“ */
function groupInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const letters = (words.length > 1 ? [words[0][0], words[1][0]] : [...(words[0] ?? "S").slice(0, 2)]).join("");
  return letters.toLocaleUpperCase("cs");
}
