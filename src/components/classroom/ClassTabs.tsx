"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "../Icon";
import { Avatar, EmptyNote } from "../PageHeader";
import { MeetEditor } from "./MeetEditor";
import type { Role, WorkItemKind, WorkStatus, WorkTopic } from "@/lib/types";
import styles from "./classroom.module.css";

type Person = { id: string; name: string; initials: string; role: Role };

export type ClassView = {
  me: Person;
  teacher: Person;
  teacherLabel: string;
  stream: (
    | {
        type: "post";
        id: string;
        author: Person | null;
        when: string;
        label: string;
        text: string;
        attachments: { kind: "pdf" | "doc"; title: string; meta: string }[];
        comments: number;
      }
    | { type: "task" | "material"; id: string; title: string; meta: string; author: null }
  )[];
  topics: WorkTopic[];
  teams: { name: string; members: string }[];
  students: Person[];
  chat: { id: string; time: string; text: string; author: Person }[];
  upcoming: { title: string; when: string; urgent: boolean }[];
  next: { label: string; live: boolean } | null;
  room: string;
  meetUrl: string | null;
  canEditMeet: boolean;
  slug: string;
  kindLabel: string;
};

const TABS = [
  ["stream", "Nástěnka"],
  ["work", "Úkoly a materiály"],
  ["people", "Lidé"],
  ["chat", "Chat třídy"],
] as const;
type Tab = (typeof TABS)[number][0];

const KIND_CODE: Record<WorkItemKind, string> = { ukol: "ÚKOL", tym: "TÝM", pdf: "PDF", video: "VIDEO", kviz: "KVÍZ" };
const STATUS_CHIP: Record<WorkStatus, string> = { ceka: "chip-wait", hotovo: "chip-ok", info: "chip-info" };

function toneFor(p: Person, me: Person) {
  if (p.id === me.id) return "me" as const;
  return p.role === "student" ? ("student" as const) : ("late" as const);
}

export function ClassTabs({ view }: { view: ClassView }) {
  const [tab, setTab] = useState<Tab>("stream");

  return (
    <>
      <div role="tablist" aria-label="Sekce třídy" className="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            className="tab"
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "stream" && <Stream view={view} />}
        {tab === "work" && <Work topics={view.topics} />}
        {tab === "people" && <People view={view} />}
        {tab === "chat" && <Chat view={view} />}
      </div>
    </>
  );
}

function Stream({ view }: { view: ClassView }) {
  return (
    <div className={styles.columns}>
      <div className={styles.mainCol}>
        <div className={`card ${styles.composer}`}>
          <Avatar initials={view.me.initials} size={40} tone="me" />
          <input
            type="text"
            aria-label="Napiš příspěvek třídě"
            placeholder="Psaní příspěvků přidáme v etapě 3"
            disabled
            className={styles.composerInput}
          />
        </div>

        {view.stream.length === 0 && (
          <EmptyNote>Nástěnka je zatím prázdná. Příspěvky a oznámení přidáme v etapě 3.</EmptyNote>
        )}
        {view.stream.map((item) =>
          item.type === "post" ? (
            <article key={item.id} className={`card ${styles.post}`}>
              <div className={styles.postHead}>
                {item.author && <Avatar initials={item.author.initials} size={40} tone={toneFor(item.author, view.me)} />}
                <div>
                  <div className={styles.strong}>{item.author?.name}</div>
                  <div className={styles.meta}>
                    {item.when} · {item.label}
                  </div>
                </div>
              </div>
              <p className={styles.postText}>{item.text}</p>
              {item.attachments.length > 0 && (
                <div className={styles.attachments}>
                  {item.attachments.map((a) => (
                    <div key={a.title} className={styles.attachment}>
                      <div className={styles.fileBadge} data-kind={a.kind}>
                        {a.kind.toUpperCase()}
                      </div>
                      <div>
                        <div className={styles.strong}>{a.title}</div>
                        <div className={styles.meta}>{a.meta}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {item.comments > 0 && (
                <div className={styles.comments}>
                  <Icon name="comment" size={16} />
                  {item.comments} {item.comments === 1 ? "komentář" : item.comments < 5 ? "komentáře" : "komentářů"} třídy
                </div>
              )}
            </article>
          ) : (
            <div key={item.id} className={`card ${styles.event}`}>
              <div className={styles.eventIcon} data-kind={item.type}>
                <Icon name={item.type === "task" ? "file" : "play"} size={22} />
              </div>
              <div className={styles.grow}>
                <div className={styles.strong}>{item.title}</div>
                <div className={styles.meta}>{item.meta}</div>
              </div>
            </div>
          ),
        )}
      </div>

      <div className={styles.sideCol}>
        <section aria-label="Nadcházející" className={`card ${styles.sidePanel}`}>
          <h2 className={styles.h2}>Nadcházející</h2>
          {view.upcoming.length === 0 ? (
            <div className={styles.meta}>Žádné termíny.</div>
          ) : (
            view.upcoming.map((u) => (
              <div key={u.title}>
                <div className={styles.when} data-urgent={u.urgent}>
                  {u.when}
                </div>
                <div className={styles.strong}>{u.title}</div>
              </div>
            ))
          )}
        </section>
        <section aria-label="Příští hodina" className={`card ${styles.sidePanel}`}>
          <h2 className={styles.h2}>{view.next?.live ? "Hodina" : "Příští hodina"}</h2>
          {view.next && <div className={styles.nextLabel}>{view.next.label}</div>}
          <div className={styles.meta}>
            {view.room ? `${view.room[0].toUpperCase()}${view.room.slice(1)} nebo online.` : "Online."} Odkaz na Meet je stejný
            pro celý blok.
          </div>
          {view.meetUrl ? (
            <a href={view.meetUrl} target="_blank" rel="noopener noreferrer" className="btn btn-soft">
              {view.meetUrl.replace(/^https:\/\//, "")}
            </a>
          ) : (
            <div className={styles.meta}>Odkaz na Meet zatím není.</div>
          )}
          {view.canEditMeet && <MeetEditor activity={view.slug} current={view.meetUrl} />}
        </section>
      </div>
    </div>
  );
}

function Work({ topics }: { topics: WorkTopic[] }) {
  if (topics.length === 0) {
    return <EmptyNote>Zatím tu nejsou žádné úkoly ani materiály. Zadávání úkolů přidáme v etapě 2.</EmptyNote>;
  }
  return (
    <div className="stack" style={{ gap: 16 }}>
      {topics.map((t) => (
        <section key={t.name} className={`card ${styles.topic}`}>
          <h2 className={styles.topicTitle}>{t.name}</h2>
          {t.items.map((it) => (
            <div key={it.id} className={styles.workRow}>
              <div className={styles.workIcon} data-kind={it.kind}>
                {KIND_CODE[it.kind]}
              </div>
              <div className={styles.workMain}>
                <div className={styles.strong}>{it.title}</div>
                <div className={styles.meta}>{it.meta}</div>
              </div>
              <span className={`chip ${STATUS_CHIP[it.statusTone]}`}>{it.status}</span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function People({ view }: { view: ClassView }) {
  return (
    <div className={styles.columns}>
      <section aria-label="Vyučující" className={`card ${styles.peopleSide}`}>
        <h2 className={styles.h2}>Vyučující</h2>
        <div className={styles.teacherRow}>
          <Avatar initials={view.teacher.initials} size={44} tone="late" />
          <div className={styles.grow}>
            <div className={styles.strong} style={{ fontSize: 15 }}>
              {view.teacher.name}
            </div>
            <div className={styles.meta}>{view.teacherLabel}</div>
          </div>
          {view.teacher.id !== view.me.id && (
            <Link href="/zpravy" aria-label={`Napsat: ${view.teacher.name}`} className={styles.msgBtn}>
              <Icon name="chat" size={18} />
            </Link>
          )}
        </div>
        {view.teams.length > 0 && (
          <>
            <h2 className={styles.h2} style={{ marginTop: 8 }}>
              Týmy
            </h2>
            {view.teams.map((t) => (
              <div key={t.name} className={styles.team}>
                <div className={styles.strong}>{t.name}</div>
                <div className={styles.meta}>{t.members}</div>
              </div>
            ))}
          </>
        )}
      </section>
      <section aria-label="Studenti" className={`card ${styles.students}`}>
        <h2 className={styles.h2}>Studenti · {view.students.length}</h2>
        <div className={styles.studentGrid}>
          {view.students.map((s) => (
            <div key={s.id} className={styles.student}>
              <Avatar initials={s.initials} size={36} tone={s.id === view.me.id ? "me" : "student"} />
              <span>{s.name}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Chat({ view }: { view: ClassView }) {
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  const send = () => {
    const t = draft.trim();
    if (!t) return;
    setSent((s) => [...s, t]);
    setDraft("");
  };
  const messages = [
    ...view.chat,
    ...sent.map((text, i) => ({ id: `local-${i}`, time: "teď", text, author: view.me })),
  ];

  return (
    <section aria-label="Chat třídy" className={`card ${styles.chat}`}>
      <div className={styles.chatList}>
        {messages.length === 0 && <div className={styles.meta}>Zatím tu nikdo nic nenapsal.</div>}
        {messages.map((m) => (
          <div key={m.id} className={styles.msg}>
            <Avatar initials={m.author.initials} size={36} tone={toneFor(m.author, view.me)} />
            <div>
              <div className={styles.msgHead}>
                <span className={styles.strong}>{m.author.name}</span>
                <span className={styles.meta}>{m.time}</span>
              </div>
              <div className={styles.msgText}>{m.text}</div>
            </div>
          </div>
        ))}
      </div>
      <form
        className={styles.chatForm}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          type="text"
          aria-label="Zpráva pro celou třídu"
          placeholder="Zpráva pro celou třídu…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={styles.composerInput}
        />
        <button type="submit" className="btn btn-primary">
          Odeslat
        </button>
      </form>
      <div className={styles.chatNote}>Ukázkový režim: zprávy se zatím neukládají (chat přijde v etapě 3).</div>
    </section>
  );
}
