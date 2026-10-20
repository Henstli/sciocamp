import type { Metadata } from "next";
import { isGifUrl } from "@/components/composer/gif";
import { Messenger, type ContactView, type ThreadMessage } from "@/components/messages/Messenger";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { isSupabase } from "@/lib/config";
import { listUsers } from "@/lib/data";
import { conversationMessages, conversationsFor, otherMemberState } from "@/lib/data-communication";
import { plural } from "@/lib/format";
import { initials, roleCaption } from "@/lib/roles";
import { formatClock, formatDayLabel, formatListTime } from "@/lib/time";
import type { User } from "@/lib/types";

export const metadata: Metadata = { title: "Zprávy" };

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

  const list = conversations
    .map((c) => {
      const other = byId.get(c.otherId);
      if (!other) return null;
      const preview = isGifUrl(c.lastBody) ? "GIF" : c.lastBody || (c.lastHasFile ? "Příloha" : "");
      return {
        id: c.id,
        person: contact(other),
        time: formatListTime(c.lastAt, now),
        preview: c.lastMine ? `Ty: ${preview}` : preview,
        unread: c.unread,
      };
    })
    .filter((c): c is NonNullable<typeof c> => !!c);

  // Která konverzace je otevřená: ?k=<id>, nebo ?s=<id člověka> (i nová, zatím bez zpráv).
  const wanted = typeof k === "string" ? list.find((c) => c.id === k) : undefined;
  const withPerson = typeof s === "string" && s !== user.id ? byId.get(s) : undefined;
  const existing = withPerson ? list.find((c) => c.person.id === withPerson.id) : undefined;
  const active = wanted ?? existing ?? null;
  const activePerson = active?.person ?? (withPerson ? contact(withPerson) : null);
  const explicit = !!(wanted || withPerson);
  const fallback = !explicit ? list[0] ?? null : null;
  const open = active ?? fallback;

  const messages: ThreadMessage[] = open
    ? (await conversationMessages(open.id)).map((m) => ({
        id: m.id,
        mine: m.authorId === user.id,
        body: m.body,
        file: m.file,
        time: formatClock(m.createdAt),
        day: formatDayLabel(m.createdAt, now),
        createdAt: m.createdAt,
      }))
    : [];
  const otherState = open ? await otherMemberState(open.id, user) : null;

  const unread = list.reduce((n, c) => n + c.unread, 0);
  const people = users
    .filter((u) => u.id !== user.id && u.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name, "cs"))
    .map(contact);

  return (
    <>
      <PageHeader
        title="Zprávy"
        subtitle={unread > 0 ? `${unread} ${plural(unread, "nepřečtená", "nepřečtené", "nepřečtených")}` : "Soukromé zprávy se spolužáky a vyučujícími"}
        avatar={{ initials: initials(user.name), name: user.name }}
      />
      <Messenger
        key={open?.id ?? activePerson?.id ?? "nic"}
        me={{ id: user.id, initials: initials(user.name) }}
        conversations={list}
        people={people}
        activeId={open?.id ?? null}
        activePerson={open?.person ?? activePerson}
        showThreadOnMobile={explicit}
        initialMessages={messages}
        live={isSupabase}
        otherState={otherState}
      />
    </>
  );
}
