"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "../Icon";
import { Avatar, EmptyNote, profileHref } from "../PageHeader";
import { ClassChat, type ChatLine } from "./ClassChat";
import { MeetEditor } from "./MeetEditor";
import { type Person } from "./people";
import { Stream, type StreamEntry } from "./Stream";
import { SignupBoards, type SignupsView } from "../signups/SignupBoards";
import { FinalReviews, type FinalView } from "./FinalReviews";
import styles from "./classroom.module.css";

export type ClassView = {
  me: Person;
  teacher: Person;
  teacherLabel: string;
  /** Další vyučující (spoluvyučující, u událostí třeba všichni učitelé) */
  coTeachers: Person[];
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
  /** Rozdělení (pokoje, služby) — jen u expedic */
  signups?: SignupsView;
  /** Závěrečné hodnocení — jen vyučující a admin u kurzu, ateliéru a expedice */
  final?: FinalView;
};

const BASE_TABS = [
  ["stream", "Nástěnka"],
  ["work", "Úkoly a materiály"],
  ["people", "Lidé"],
  ["chat", "Chat třídy"],
] as const;
type Tab = (typeof BASE_TABS)[number][0] | "rozdeleni" | "hodnoceni";


export function ClassTabs({ view, initialTab }: { view: ClassView; initialTab?: string }) {
  // Expedice má navíc záložku Rozdělení (pokoje, vaření, úklid…).
  const TABS: (readonly [Tab, string])[] = view.signups
    ? [BASE_TABS[0], ["rozdeleni", "Rozdělení"], ...BASE_TABS.slice(1)]
    : [...BASE_TABS];
  if (view.final) TABS.push(["hodnoceni", "Závěrečné hodnocení"]);
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
        {tab === "rozdeleni" && view.signups && (
          <SignupBoards
            view={view.signups}
            me={view.me}
            students={view.students}
            canManage={view.canManage}
            activitySlug={view.slug}
            live={view.live}
          />
        )}
        {tab === "hodnoceni" && view.final && <FinalReviews view={view.final} slug={view.slug} live={view.live} />}
        {tab === "chat" && (
          <ClassChat
            initial={view.chat}
            me={view.me}
            people={view.people}
            mentionIds={[...view.students.map((p) => p.id), view.teacher.id, ...view.coTeachers.map((p) => p.id)]}
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
            <Icon name="plus" size={16} strokeWidth={2.8} />
            Zadat úkol nebo materiál
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
        <h2 className={styles.h2}>Vyučující{view.coTeachers.length > 0 ? ` · ${view.coTeachers.length + 1}` : ""}</h2>
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
        {view.coTeachers.map((t) => (
          <div key={t.id} className={styles.teacherRow}>
            <Avatar initials={t.initials} size={36} tone="ucitel" href={profileHref(t.id)} title={t.name} />
            <div className={styles.grow}>
              <div className={styles.strong}>{t.name}</div>
              <div className={styles.meta}>Další vyučující</div>
            </div>
            {t.id !== view.me.id && (
              <Link href={`/zpravy?s=${t.id}`} aria-label={`Napsat: ${t.name}`} className={styles.msgBtn}>
                <Icon name="chat" size={18} />
              </Link>
            )}
          </div>
        ))}
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
