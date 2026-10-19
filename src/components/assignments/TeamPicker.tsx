"use client";

// Studenti se do týmů rozdělují sami: přidat se k týmu, založit nový, odejít.

import { useState, useTransition } from "react";
import { createOwnTeam, joinTeam, leaveTeam } from "@/lib/actions/teams";
import styles from "./assignment.module.css";

type TeamView = { id: string; name: string; members: string[] };

export function TeamPicker({
  assignmentId,
  teams,
  myTeamId,
  maxSize,
  locked,
}: {
  assignmentId: string;
  teams: TeamView[];
  myTeamId: string | null;
  maxSize: number | null;
  /** Práce je ohodnocená — tým už měnit nejde */
  locked: boolean;
}) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ error?: string; info?: string }>({});
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string; info?: string }>) =>
    start(async () => {
      setMessage({});
      setMessage((await fn()) ?? {});
    });
  const mine = teams.find((t) => t.id === myTeamId) ?? null;

  return (
    <section className={`card ${styles.panel}`} aria-label="Týmy">
      <div className={styles.panelHead}>
        <h2 className={styles.h2}>{mine ? `Tvůj tým: ${mine.name}` : "Vyber si tým"}</h2>
        {maxSize && <span className="chip chip-info">nejvýš {maxSize} v týmu</span>}
      </div>
      {!mine && (
        <p className={styles.small}>U tohoto úkolu se do týmů rozdělujete sami. Přidej se k týmu, nebo založ nový.</p>
      )}

      <ul className={styles.teamList}>
        {teams.map((t) => {
          const full = maxSize !== null && t.members.length >= maxSize;
          return (
            <li key={t.id} className={styles.teamRow} data-mine={t.id === myTeamId}>
              <span className={styles.teamRowText}>
                <span className={styles.itemName}>{t.name}</span>
                <span className={styles.itemMeta}>
                  {t.members.join(", ") || "zatím nikdo"}
                  {maxSize ? ` · ${t.members.length}/${maxSize}` : ""}
                </span>
              </span>
              {t.id === myTeamId ? (
                !locked && (
                  <button type="button" className="btn btn-outline" disabled={pending} onClick={() => run(() => leaveTeam(t.id))}>
                    Odejít
                  </button>
                )
              ) : (
                !mine &&
                !locked && (
                  <button type="button" className="btn btn-soft" disabled={pending || full} onClick={() => run(() => joinTeam(t.id))}>
                    {full ? "Plný" : "Přidat se"}
                  </button>
                )
              )}
            </li>
          );
        })}
        {teams.length === 0 && <li className={styles.small}>Zatím žádný tým. Založ první!</li>}
      </ul>

      {!mine && !locked && (
        <form
          className={styles.addRow}
          onSubmit={(e) => {
            e.preventDefault();
            const value = name;
            run(async () => {
              const res = await createOwnTeam(assignmentId, value);
              if (!res.error) setName("");
              return res;
            });
          }}
        >
          <label className="sr-only" htmlFor={`novy-tym-${assignmentId}`}>
            Název nového týmu
          </label>
          <input
            id={`novy-tym-${assignmentId}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Název nového týmu…"
            className={styles.input}
          />
          <button type="submit" className="btn btn-primary" disabled={pending || !name.trim()}>
            Založit tým
          </button>
        </form>
      )}

      {(message.error || message.info) && (
        <p role={message.error ? "alert" : "status"} className={message.error ? styles.error : styles.info}>
          {message.error ?? message.info}
        </p>
      )}
    </section>
  );
}
