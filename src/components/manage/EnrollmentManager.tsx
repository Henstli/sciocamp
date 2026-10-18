"use client";

import { useMemo, useState, useTransition } from "react";
import { updateEnrollments, type EnrollState } from "@/lib/actions/activities";
import { Avatar } from "../PageHeader";
import styles from "./manage.module.css";

type Student = { id: string; name: string; initials: string; grade: number | null; email: string };

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Zápis studentů do kurzu: vlevo zapsaní, vpravo ostatní s hledáním. */
export function EnrollmentManager({
  slug,
  students,
  enrolledIds,
  allowedGrades,
  capacity,
  conflicts = {},
}: {
  slug: string;
  /** Ateliér: studenti, kteří jsou v té době už v jiném ateliéru (id → název ateliéru) */
  conflicts?: Record<string, string>;
  students: Student[];
  enrolledIds: string[];
  allowedGrades: number[] | null;
  capacity: number | null;
}) {
  const [enrolled, setEnrolled] = useState(new Set(enrolledIds));
  const [picked, setPicked] = useState(new Set<string>());
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState<number | "all">("all");
  const [onlyAllowed, setOnlyAllowed] = useState(!!allowedGrades);
  const [msg, setMsg] = useState<EnrollState>({});
  const [pending, start] = useTransition();

  const inClass = students.filter((s) => enrolled.has(s.id));
  const candidates = useMemo(() => {
    const q = fold(query.trim());
    return students
      .filter((s) => !enrolled.has(s.id))
      .filter((s) => grade === "all" || s.grade === grade)
      .filter((s) => !onlyAllowed || !allowedGrades || (s.grade !== null && allowedGrades.includes(s.grade)))
      .filter((s) => !q || fold(s.name).includes(q) || s.email.includes(q));
  }, [students, enrolled, grade, onlyAllowed, allowedGrades, query]);

  const over = capacity !== null && inClass.length + picked.size > capacity;

  const run = (add: string[], remove: string[]) =>
    start(async () => {
      const res = await updateEnrollments(slug, add, remove);
      setMsg(res);
      if (!res.error) {
        setEnrolled((prev) => {
          const next = new Set(prev);
          add.forEach((id) => next.add(id));
          remove.forEach((id) => next.delete(id));
          return next;
        });
        setPicked(new Set());
      }
    });

  return (
    <div className={styles.enroll}>
      <section className={`card ${styles.enrollCol}`} aria-label="Zapsaní studenti">
        <div className={styles.enrollHead}>
          <h2 className="section-title">
            Zapsaní · {inClass.length}
            {capacity !== null && ` / ${capacity}`}
          </h2>
        </div>
        {inClass.length === 0 ? (
          <p className={styles.hint} style={{ padding: "0 20px 20px" }}>
            Zatím nikdo. Studenty přidáš vpravo.
          </p>
        ) : (
          <ul className={styles.list}>
            {inClass.map((s) => (
              <li key={s.id} className={styles.row}>
                <Avatar initials={s.initials} size={34} />
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{s.name}</span>
                  <span className={styles.hint}>{s.grade ? `${s.grade}. ročník` : "bez ročníku"}</span>
                </span>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ minHeight: 36, padding: "0 12px" }}
                  disabled={pending}
                  onClick={() => run([], [s.id])}
                  aria-label={`Odepsat: ${s.name}`}
                >
                  Odepsat
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`card ${styles.enrollCol}`} aria-label="Přidat studenty">
        <div className={styles.enrollHead}>
          <h2 className="section-title">Přidat studenty</h2>
        </div>
        <div className={styles.filters}>
          <input
            type="search"
            aria-label="Hledat studenta"
            placeholder="Hledat jméno nebo e-mail…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={styles.input}
          />
          <select aria-label="Ročník" value={grade} onChange={(e) => setGrade(e.target.value === "all" ? "all" : Number(e.target.value))} className={styles.input}>
            <option value="all">Všechny ročníky</option>
            {[1, 2, 3, 4].map((g) => (
              <option key={g} value={g}>
                {g}. ročník
              </option>
            ))}
          </select>
          {allowedGrades && (
            <label className={styles.check}>
              <input type="checkbox" checked={onlyAllowed} onChange={(e) => setOnlyAllowed(e.target.checked)} />
              Jen povolené ročníky ({allowedGrades.join(", ")}.)
            </label>
          )}
        </div>
        {candidates.length === 0 ? (
          <p className={styles.hint} style={{ padding: "0 20px 20px" }}>
            {students.length === 0 ? "Ve škole zatím nejsou žádní studenti. Přidá je admin ve Správě." : "Nikdo neodpovídá filtru."}
          </p>
        ) : (
          <ul className={styles.list}>
            {candidates.map((s) => (
              <li key={s.id}>
                <label className={styles.row} data-picked={picked.has(s.id)} data-disabled={!!conflicts[s.id]}>
                  <input
                    type="checkbox"
                    disabled={!!conflicts[s.id]}
                    checked={picked.has(s.id)}
                    onChange={(e) =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(s.id);
                        else next.delete(s.id);
                        return next;
                      })
                    }
                  />
                  <Avatar initials={s.initials} size={34} />
                  <span className={styles.rowMain}>
                    <span className={styles.rowName}>{s.name}</span>
                    <span className={styles.hint}>
                      {s.grade ? `${s.grade}. ročník` : "bez ročníku"}
                      {conflicts[s.id] && ` · v té době v ateliéru ${conflicts[s.id]}`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.enrollFoot}>
          {over && <span className={styles.fieldError}>Překročíš kapacitu {capacity} míst.</span>}
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || picked.size === 0}
            onClick={() => run([...picked], [])}
          >
            {pending ? "Ukládám…" : picked.size ? `Zapsat vybrané (${picked.size})` : "Zapsat vybrané"}
          </button>
        </div>
      </section>

      {(msg.error || msg.info) && (
        <p role="status" className={msg.error ? styles.formError : styles.formInfo} style={{ gridColumn: "1 / -1" }}>
          {msg.error ?? msg.info}
        </p>
      )}
    </div>
  );
}
