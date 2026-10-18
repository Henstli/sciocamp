"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "../Icon";
import { Avatar, EmptyNote, profileHref } from "../PageHeader";
import { ClassChat, type ChatLine } from "./ClassChat";
import { MeetEditor } from "./MeetEditor";
import { type Person } from "./people";
import { Stream, type StreamEntry } from "./Stream";
import styles from "./classroom.module.css";

export type ClassView = {
  me: Person;
  teacher: Person;
  teacherLabel: string;
  stream: StreamEntry[];
  /** Smí psát příspěvky a mazat cizí zprávy (vyučující třídy a admin) */
  canManage: boolean;
  work: {
    topics: {
      name: string;
      items: { id: string; kind: "ukol" | "material"; title: string; meta: string; chip: string; chipClass: string }[];
    }[];
    /** Odkaz na zadání nového úkolu (jen vyučující a admin) */
    newHref: string | null;
  };
  teams: { name: string; members: string }[];
  students: Person[];
  chat: ChatLine[];
  /** Lidé, kteří můžou psát do chatu (studenti, vyučující, admini) */
  people: Record<string, Person>;
  upcoming: { title: string; when: string; urgent: boolean; href?: string }[];
  next: { label: string; live: boolean } | null;
  location: string | null;
  meetUrl: string | null;
  canEditMeet: boolean;
  slug: string;
  dbId?: string;
  live: boolean;
  kindLabel: string;
};

const TABS = [
  ["stream", "Nástěnka"],
  ["work", "Úkoly a materiály"],
  ["people", "Lidé"],
  ["chat", "Chat třídy"],
] as const;
type Tab = (typeof TABS)[number][0];


export function ClassTabs({ view, initialTab }: { view: ClassView; initialTab?: string }) {
  const [tab, setTab] = useState<Tab>(TABS.some(([k]) => k === initialTab) ? (initialTab as Tab) : "stream");

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
        {tab === "stream" && <StreamTab view={view} />}
        {tab === "work" && <Work work={view.work} />}
        {tab === "people" && <People view={view} />}
        {tab === "chat" && (
          <ClassChat
            initial={view.chat}
            me={view.me}
            people={view.people}
            activityDbId={view.dbId}
            live={view.live}
            canModerate={view.canManage}
          />
        )}
      </div>
    </>
  );
}

function StreamTab({ view }: { view: ClassView }) {
  return (
    <div className={styles.columns}>
      <div className={styles.mainCol}>
        <Stream
          items={view.stream}
          me={view.me}
          canPost={view.canManage}
          activitySlug={view.slug}
          activityDbId={view.dbId}
          live={view.live}
        />
      </div>

      <div className={styles.sideCol}>
        <section aria-label="Nadcházející" className={`card ${styles.sidePanel}`}>
          <h2 className={styles.h2}>Nadcházející</h2>
          {view.upcoming.length === 0 ? (
            <div className={styles.meta}>Žádné termíny.</div>
          ) : (
            view.upcoming.map((u) =>
              u.href ? (
                <Link key={u.href} href={u.href} className={styles.upcoming}>
                  <span className={styles.when} data-urgent={u.urgent}>
                    {u.when}
                  </span>
                  <span className={styles.strong}>{u.title}</span>
                </Link>
              ) : (
                <div key={u.title}>
                  <div className={styles.when} data-urgent={u.urgent}>
                    {u.when}
                  </div>
                  <div className={styles.strong}>{u.title}</div>
                </div>
              ),
            )
          )}
        </section>
        <section aria-label="Příští hodina" className={`card ${styles.sidePanel}`}>
          <h2 className={styles.h2}>{view.next?.live ? "Hodina" : "Příští hodina"}</h2>
          {view.next && <div className={styles.nextLabel}>{view.next.label}</div>}
          <div className={styles.meta}>
            {view.location ? `Místo: ${view.location}. ` : "Výuka probíhá online. "}Odkaz na Meet je stejný pro celé
            období.
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

function Work({ work }: { work: ClassView["work"] }) {
  return (
    <div className="stack" style={{ gap: 16 }}>
      {work.newHref && (
        <div className={styles.workActions}>
          <Link href={work.newHref} className="btn btn-primary">
            + Zadat úkol nebo materiál
          </Link>
        </div>
      )}
      {work.topics.length === 0 && (
        <EmptyNote>
          {work.newHref ? "Zatím tu nejsou žádné úkoly ani materiály. Zadáš je tlačítkem výše." : "Zatím tu nejsou žádné úkoly ani materiály."}
        </EmptyNote>
      )}
      {work.topics.map((t) => (
        <section key={t.name} className={`card ${styles.topic}`}>
          <h2 className={styles.topicTitle}>{t.name}</h2>
          {t.items.map((it) => (
            <Link key={it.id} href={`/ukoly/${it.id}`} className={styles.workRow}>
              <div className={styles.workIcon} data-kind={it.kind === "ukol" ? "ukol" : "pdf"}>
                {it.kind === "ukol" ? "ÚKOL" : "MAT."}
              </div>
              <div className={styles.workMain}>
                <div className={styles.strong}>{it.title}</div>
                <div className={styles.meta}>{it.meta}</div>
              </div>
              <span className={`chip ${it.chipClass}`}>{it.chip}</span>
            </Link>
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
          <Avatar initials={view.teacher.initials} size={44} tone="late" href={profileHref(view.teacher.id)} title={view.teacher.name} />
          <div className={styles.grow}>
            <div className={styles.strong} style={{ fontSize: 15 }}>
              {view.teacher.name}
            </div>
            <div className={styles.meta}>{view.teacherLabel}</div>
          </div>
          {view.teacher.id !== view.me.id && (
            <Link href={`/zpravy?s=${view.teacher.id}`} aria-label={`Napsat: ${view.teacher.name}`} className={styles.msgBtn}>
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
              <Avatar initials={s.initials} size={36} tone={s.id === view.me.id ? "me" : "student"} href={profileHref(s.id)} title={s.name} />
              <span className={styles.grow}>{s.name}</span>
              {s.id !== view.me.id && (
                <Link href={`/zpravy?s=${s.id}`} aria-label={`Napsat: ${s.name}`} className={styles.studentMsg}>
                  <Icon name="chat" size={16} />
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
