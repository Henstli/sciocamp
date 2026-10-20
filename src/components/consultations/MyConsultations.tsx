"use client";

import { useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import {
  cancelConsultation,
  inviteToConsultation,
  removeConsultationGuest,
  setConsultationMeet,
  type ConsultResult,
} from "@/lib/actions/consultations";
import { fold } from "@/lib/search";
import styles from "@/app/(app)/konzultace/konzultace.module.css";

type Person = { id: string; name: string };
export type ConsultationView = {
  id: string;
  day: string;
  dayLabel: string;
  span: string;
  meetUrl: string | null;
  teacher: Person;
  student: Person;
  guests: Person[];
  /** Jak se ho přihlášený účastní */
  role: "teacher" | "student" | "guest";
  canCancel: boolean;
};
type Candidate = { id: string; name: string; sub: string; initials: string };

/** Nadcházející konzultace přihlášeného: Meet, pozvaní, zrušení. */
export function MyConsultations({ items, people }: { items: ConsultationView[]; people: Candidate[] }) {
  return (
    <section className={`card ${styles.panel}`} aria-label="Moje konzultace">
      <h2 className="section-title">Moje konzultace</h2>
      {items.length === 0 ? (
        <p className={styles.muted}>Zatím žádné naplánované konzultace.</p>
      ) : (
        <div className={styles.list}>
          {items.map((c) => (
            <Item key={c.id} c={c} people={people} />
          ))}
        </div>
      )}
    </section>
  );
}

function Item({ c, people }: { c: ConsultationView; people: Candidate[] }) {
  const [mode, setMode] = useState<"idle" | "meet" | "invite" | "cancel">("idle");
  const [url, setUrl] = useState(c.meetUrl ?? "");
  const [query, setQuery] = useState("");
  const [res, setRes] = useState<ConsultResult>({});
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<ConsultResult>) =>
    start(async () => {
      const r = await fn();
      setRes(r);
      if (r.ok) setMode("idle");
    });

  const inside = new Set([c.teacher.id, c.student.id, ...c.guests.map((g) => g.id)]);
  const q = fold(query.trim());
  const matches = q ? people.filter((p) => !inside.has(p.id) && fold(p.name).includes(q)).slice(0, 6) : [];
  const other = c.role === "teacher" ? c.student : c.teacher;

  return (
    <article className={styles.item}>
      <div className={styles.when}>
        <strong>{c.dayLabel}</strong>
        <span>{c.span}</span>
      </div>
      <div className={styles.itemBody}>
        <div className={styles.who}>
          <Avatar initials={initialsOf(other.name)} userId={other.id} href={`/lide/${other.id}`} size={30} title={other.name} />
          <span>
            {c.role === "teacher" ? "Student" : "Vyučující"}: <strong>{other.name}</strong>
            {c.role === "guest" && <> · zapsaný(á) {c.student.name}</>}
          </span>
        </div>
        {c.guests.length > 0 && (
          <div className={styles.guests}>
            Pozvaní:
            {c.guests.map((g) => (
              <span key={g.id} className={styles.guest}>
                {g.name}
                {c.role !== "guest" && (
                  <button
                    type="button"
                    aria-label={`Odebrat ${g.name}`}
                    disabled={pending}
                    onClick={() => act(() => removeConsultationGuest(c.id, g.id))}
                  >
                    <Icon name="close" size={12} strokeWidth={2.6} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        <div className={styles.actions}>
          {c.meetUrl ? (
            <a href={c.meetUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ minHeight: 36 }}>
              <Icon name="video" size={16} />
              Připojit se přes Meet
            </a>
          ) : null}
          <button type="button" className="btn btn-soft" style={{ minHeight: 36 }} onClick={() => setMode(mode === "meet" ? "idle" : "meet")}>
            {c.meetUrl ? "Změnit Meet" : "Přidat Meet"}
          </button>
          <button type="button" className="btn btn-outline" style={{ minHeight: 36 }} onClick={() => setMode(mode === "invite" ? "idle" : "invite")}>
            Pozvat
          </button>
          {c.canCancel ? (
            <button type="button" className={styles.linkBtn} onClick={() => setMode("cancel")}>
              Zrušit konzultaci
            </button>
          ) : (
            <button type="button" className={styles.linkBtn} disabled={pending} onClick={() => act(() => removeConsultationGuest(c.id, "me"))}>
              Odejít
            </button>
          )}
        </div>

        {mode === "meet" && (
          <div className={styles.inline}>
            <input
              className={styles.input}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://meet.google.com/…"
              inputMode="url"
              aria-label="Odkaz na Google Meet"
            />
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => act(() => setConsultationMeet(c.id, url))}>
              Uložit
            </button>
            <a href="https://meet.google.com/new" target="_blank" rel="noopener noreferrer" className={styles.small}>
              Vytvořit nový Meet
            </a>
          </div>
        )}
        {mode === "invite" && (
          <div className={styles.invite}>
            <input
              className={styles.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Jméno studenta nebo vyučujícího…"
              aria-label="Koho pozvat"
              autoFocus
            />
            {matches.map((p) => (
              <button key={p.id} type="button" className={styles.candidate} disabled={pending} onClick={() => act(() => inviteToConsultation(c.id, p.id))}>
                <Avatar initials={p.initials} userId={p.id} size={28} />
                <span>
                  {p.name} <small>{p.sub}</small>
                </span>
              </button>
            ))}
            {q && matches.length === 0 && <span className={styles.small}>Nikdo takový.</span>}
          </div>
        )}
        {mode === "cancel" && (
          <div className={styles.inline}>
            <span className={styles.small}>Konzultace se zruší všem a dostanou oznámení.</span>
            <button
              type="button"
              className="btn btn-outline"
              style={{ minHeight: 36, color: "var(--late-fg)", borderColor: "var(--late-line)" }}
              disabled={pending}
              onClick={() => act(() => cancelConsultation(c.id))}
            >
              Ano, zrušit
            </button>
            <button type="button" className="btn btn-soft" style={{ minHeight: 36 }} onClick={() => setMode("idle")}>
              Zpět
            </button>
          </div>
        )}
        {(res.error || res.info) && (
          <p role="status" className={res.error ? styles.error : styles.info}>
            {res.error ?? res.info}
          </p>
        )}
      </div>
    </article>
  );
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
