"use client";

// Rozdělení do týmů přímo v zadání úkolu: ručně, náhodně, nebo převzetím
// týmů z dřívějšího týmového úkolu. Hodnota se odešle se zadáním (JSON).

import { useState } from "react";
import { Icon } from "../Icon";
import { StaffPicker } from "../manage/StaffPicker";
import styles from "../manage/manage.module.css";

export type TeamDraft = { id?: string; name: string; memberIds: string[] };
export type TeamPreset = { assignmentId: string; title: string; teams: TeamDraft[] };
type Student = { id: string; name: string };

const membersLabel = (n: number) => `${n} ${n === 1 ? "člen" : n >= 2 && n <= 4 ? "členové" : "členů"}`;

export function TeamsField({
  students,
  value,
  onChange,
  presets,
}: {
  students: Student[];
  value: TeamDraft[];
  onChange: (teams: TeamDraft[]) => void;
  presets: TeamPreset[];
}) {
  const [count, setCount] = useState(String(Math.max(2, value.length || Math.min(4, Math.ceil(students.length / 4)))));
  const [note, setNote] = useState<string | null>(null);
  const assigned = new Set(value.flatMap((t) => t.memberIds));
  const unassigned = students.filter((s) => !assigned.has(s.id));

  const set = (i: number, patch: Partial<TeamDraft>) => onChange(value.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  function randomize() {
    const n = Math.max(1, Math.min(20, Number(count) || 2));
    const shuffled = [...students];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const next: TeamDraft[] = Array.from({ length: n }, (_, i) => ({ id: value[i]?.id, name: value[i]?.name || `Tým ${i + 1}`, memberIds: [] }));
    shuffled.forEach((s, i) => next[i % n].memberIds.push(s.id));
    onChange(next);
    setNote(`Rozděleno náhodně do ${n} týmů. Můžeš je ještě upravit.`);
  }

  function applyPreset(assignmentId: string) {
    const preset = presets.find((p) => p.assignmentId === assignmentId);
    if (!preset) return;
    const enrolled = new Set(students.map((s) => s.id));
    onChange(preset.teams.map((t) => ({ name: t.name, memberIds: t.memberIds.filter((m) => enrolled.has(m)) })));
    setNote(`Převzaty týmy z úkolu „${preset.title}“.`);
  }

  if (students.length === 0) {
    return <p className={styles.hint}>Ve třídě zatím nejsou zapsaní studenti, týmy půjdou rozdělit potom (přes Upravit).</p>;
  }

  return (
    <div className={styles.teamsField}>
      <div className={styles.teamTools}>
        <label className={styles.teamCount}>
          Rozdělit náhodně do
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
        <button type="button" className="btn btn-outline" onClick={() => onChange([...value, { name: `Tým ${value.length + 1}`, memberIds: [] }])}>
          <Icon name="plus" size={16} />
          Přidat tým ručně
        </button>
        {presets.length > 0 && (
          <select
            className={styles.input}
            style={{ width: "auto" }}
            value=""
            onChange={(e) => applyPreset(e.target.value)}
            aria-label="Převzít týmy z jiného úkolu"
          >
            <option value="">Převzít týmy z úkolu…</option>
            {presets.map((p) => (
              <option key={p.assignmentId} value={p.assignmentId}>
                {p.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {value.length === 0 && (
        <p className={styles.hint}>Zatím žádné týmy. Rozděl studenty náhodně, nebo přidej tým a vyber do něj studenty.</p>
      )}

      <div className={styles.teamGrid}>
        {value.map((t, i) => (
          <div key={t.id ?? `novy-${i}`} className={styles.teamCard}>
            <div className={styles.teamHead}>
              <label className={styles.grow}>
                <span className="sr-only">Název týmu</span>
                <input value={t.name} maxLength={80} onChange={(e) => set(i, { name: e.target.value })} className={styles.input} />
              </label>
              <button type="button" className={styles.remove} aria-label={`Smazat ${t.name}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <Icon name="trash" size={18} />
              </button>
            </div>
            <StaffPicker
              name={`tym-${i}`}
              staff={students.filter((s) => t.memberIds.includes(s.id) || !assigned.has(s.id))}
              selected={t.memberIds}
              onChange={(ids) => set(i, { memberIds: ids })}
              addLabel="Přidat studenta"
              dialogLabel="Vybrat studenta"
            />
            <span className={styles.hint}>{membersLabel(t.memberIds.length)}</span>
          </div>
        ))}
      </div>

      {value.length > 0 && unassigned.length > 0 && (
        <p className={styles.hint}>
          Bez týmu ({unassigned.length}): {unassigned.map((s) => s.name).join(", ")} — budou odevzdávat sami.
        </p>
      )}
      {note && <p className={styles.formInfo}>{note}</p>}
    </div>
  );
}
