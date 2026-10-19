"use client";

// Skládání týmů ve třídě: týmy s názvy, členové přes výběr s hledáním,
// náhodné rozdělení a uložení všeho najednou.

import { useState, useTransition } from "react";
import { Icon } from "../Icon";
import { saveTeams, type TeamDraft } from "@/lib/actions/teams";
import { StaffPicker } from "./StaffPicker";
import styles from "./manage.module.css";

type Student = { id: string; name: string };
type Draft = TeamDraft & { key: number };

export function TeamEditor({ slug, students, initial }: { slug: string; students: Student[]; initial: TeamDraft[] }) {
  const [teams, setTeams] = useState<Draft[]>(() => initial.map((t, i) => ({ ...t, key: i })));
  const [nextKey, setNextKey] = useState(initial.length + 1);
  const [count, setCount] = useState(String(Math.max(2, initial.length || Math.min(4, Math.ceil(students.length / 4)))));
  const [message, setMessage] = useState<{ error?: string; info?: string }>({});
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();

  const assigned = new Set(teams.flatMap((t) => t.memberIds));
  const unassigned = students.filter((s) => !assigned.has(s.id));

  const update = (key: number, patch: Partial<Draft>) => {
    setTeams((all) => all.map((t) => (t.key === key ? { ...t, ...patch } : t)));
    setDirty(true);
    setMessage({});
  };

  function addTeam() {
    setTeams((all) => [...all, { key: nextKey, name: `Tým ${all.length + 1}`, memberIds: [] }]);
    setNextKey((k) => k + 1);
    setDirty(true);
  }

  function randomize() {
    const n = Math.max(1, Math.min(20, Number(count) || 2));
    const shuffled = [...students];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // Stávající týmy (a jejich názvy) se použijí jako první, chybějící se dozaloží.
    const base: Draft[] = Array.from({ length: n }, (_, i) =>
      teams[i] ? { ...teams[i], memberIds: [] } : { key: nextKey + i, name: `Tým ${i + 1}`, memberIds: [] },
    );
    shuffled.forEach((s, i) => base[i % n].memberIds.push(s.id));
    setTeams(base);
    setNextKey((k) => k + n);
    setDirty(true);
    setMessage({ info: `Rozděleno náhodně do ${n} týmů. Nezapomeň uložit.` });
  }

  function save() {
    start(async () => {
      const res = await saveTeams(
        slug,
        teams.map(({ id, name, memberIds }) => ({ id, name, memberIds })),
      );
      setMessage(res);
      if (!res.error) setDirty(false);
    });
  }

  return (
    <section className={`card ${styles.form}`} aria-label="Týmy">
      <div>
        <h2 className="section-title">Týmy</h2>
        <p className={styles.hint}>
          Týmy využiješ u týmových úkolů (tým odevzdává společnou práci) a každý tým má svůj chat. Student může být ve třídě jen v
          jednom týmu.
        </p>
      </div>

      {students.length === 0 ? (
        <p className={styles.hint}>Nejdřív do třídy zapiš studenty.</p>
      ) : (
        <>
          <div className={styles.teamTools}>
            <label className={styles.teamCount}>
              Rozdělit všechny náhodně do
              <input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className={styles.input}
                aria-label="Počet týmů"
              />
              týmů
            </label>
            <button type="button" className="btn btn-outline" onClick={randomize}>
              Rozdělit náhodně
            </button>
            <button type="button" className="btn btn-outline" onClick={addTeam}>
              <Icon name="plus" size={16} />
              Nový tým
            </button>
          </div>

          <div className={styles.teamGrid}>
            {teams.map((t) => (
              <div key={t.key} className={styles.teamCard}>
                <div className={styles.teamHead}>
                  <label className={styles.grow}>
                    <span className="sr-only">Název týmu</span>
                    <input value={t.name} maxLength={80} onChange={(e) => update(t.key, { name: e.target.value })} className={styles.input} />
                  </label>
                  <button
                    type="button"
                    className={styles.remove}
                    aria-label={`Smazat ${t.name}`}
                    onClick={() => {
                      setTeams((all) => all.filter((x) => x.key !== t.key));
                      setDirty(true);
                    }}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </div>
                <StaffPicker
                  name={`tym-${t.key}`}
                  staff={students.filter((s) => t.memberIds.includes(s.id) || !assigned.has(s.id))}
                  selected={t.memberIds}
                  onChange={(ids) => update(t.key, { memberIds: ids })}
                  addLabel="Přidat studenta"
                  dialogLabel="Vybrat studenta"
                />
                <span className={styles.hint}>
                  {t.memberIds.length} {t.memberIds.length === 1 ? "člen" : t.memberIds.length < 5 ? "členové" : "členů"}
                </span>
              </div>
            ))}
          </div>

          {unassigned.length > 0 && teams.length > 0 && (
            <p className={styles.hint}>
              Bez týmu ({unassigned.length}): {unassigned.map((s) => s.name).join(", ")}
            </p>
          )}
        </>
      )}

      {(message.error || message.info) && (
        <p role="status" className={message.error ? styles.formError : styles.formInfo}>
          {message.error ?? message.info}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className="btn btn-primary" disabled={pending || !dirty} onClick={save}>
          {pending ? "Ukládám…" : dirty ? "Uložit týmy" : "Týmy jsou uložené"}
        </button>
      </div>
    </section>
  );
}
