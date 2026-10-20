"use client";

// Tabulka studentů ve Statistikách: kolik má kdo splněných kurzů, ateliérů
// a expedic. Filtry (jméno, ročník, jen problémy) a pevná výška s posuvníkem,
// aby se stránka u 150 studentů netáhla donekonečna.

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import type { CompletionSummary } from "@/lib/completion";
import { fold } from "@/lib/search";
import { CountCell, RateCell } from "./StatBits";
import styles from "./stats.module.css";

export type CompletionStudent = {
  id: string;
  name: string;
  grade: number | null;
  kinds: CompletionSummary[];
  handedRate: number | null;
};

type Filter = "vse" | "problem" | "ceka";

export function CompletionTable({
  rows,
  kinds,
  keep,
}: {
  rows: CompletionStudent[];
  kinds: { kind: string; label: string }[];
  keep: string;
}) {
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState<number | "vse">("vse");
  const [filter, setFilter] = useState<Filter>("vse");
  const grades = [...new Set(rows.map((r) => r.grade ?? 0))].sort((a, b) => (a || 9) - (b || 9));

  const shown = useMemo(() => {
    const f = fold(q.trim());
    return rows.filter(
      (r) =>
        (grade === "vse" || (r.grade ?? 0) === grade) &&
        (!f || fold(r.name).includes(f)) &&
        (filter === "vse" ||
          (filter === "problem" && r.kinds.some((k) => k.nesplneno > 0)) ||
          (filter === "ceka" && r.kinds.some((k) => k.ceka > 0))),
    );
  }, [rows, q, grade, filter]);

  const problems = rows.filter((r) => r.kinds.some((k) => k.nesplneno > 0)).length;
  const waiting = rows.filter((r) => r.kinds.some((k) => k.ceka > 0)).length;
  const byGrade = [...new Set(shown.map((r) => r.grade ?? 0))].sort((a, b) => (a || 9) - (b || 9));

  return (
    <>
      <div className={styles.tableTools}>
        <label className={styles.pickerField}>
          <Icon name="search" size={16} />
          <span className="sr-only">Hledat studenta v tabulce</span>
          <input type="search" value={q} placeholder="Hledat jméno…" onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className={`tablist ${styles.tabs}`} role="group" aria-label="Ročník">
          <button type="button" className="tab" aria-current={grade === "vse" ? "true" : undefined} onClick={() => setGrade("vse")}>
            Všechny ročníky
          </button>
          {grades.map((g) => (
            <button key={g} type="button" className="tab" aria-current={grade === g ? "true" : undefined} onClick={() => setGrade(g)}>
              {g ? `${g}. ročník` : "Bez ročníku"}
            </button>
          ))}
        </div>
        <div className={`tablist ${styles.tabs}`} role="group" aria-label="Zobrazit">
          <button type="button" className="tab" aria-current={filter === "vse" ? "true" : undefined} onClick={() => setFilter("vse")}>
            Všichni
          </button>
          <button type="button" className="tab" aria-current={filter === "problem" ? "true" : undefined} onClick={() => setFilter("problem")}>
            Něco nesplnili ({problems})
          </button>
          <button type="button" className="tab" aria-current={filter === "ceka" ? "true" : undefined} onClick={() => setFilter("ceka")}>
            Čeká na hodnocení ({waiting})
          </button>
        </div>
      </div>
      <p className={styles.tableCount} aria-live="polite">
        Zobrazeno {shown.length} z {rows.length} studentů
      </p>
      <div className={`${styles.tableWrap} ${styles.tall}`}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Student</th>
              {kinds.map((k) => (
                <th key={k.kind}>{k.label}</th>
              ))}
              <th>Úkoly</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={kinds.length + 2} className={styles.muted}>
                  Nikdo neodpovídá filtru.
                </td>
              </tr>
            )}
            {byGrade.flatMap((g) => [
              ...(grade === "vse"
                ? [
                    <tr key={`g${g}`} className={styles.groupRow}>
                      <th colSpan={kinds.length + 2}>{g ? `${g}. ročník` : "Bez ročníku"}</th>
                    </tr>,
                  ]
                : []),
              ...shown
                .filter((r) => (r.grade ?? 0) === g)
                .map((r) => (
                  <tr key={r.id}>
                    <th scope="row">
                      <Link href={`/statistiky/${r.id}${keep}`} className={styles.rowTitle}>
                        {r.name}
                      </Link>
                    </th>
                    {r.kinds.map((s, i) => (
                      <td key={kinds[i].kind}>
                        <CountCell summary={s} />
                      </td>
                    ))}
                    <td>
                      <RateCell value={r.handedRate} detail="odevzdané úkoly" />
                    </td>
                  </tr>
                )),
            ])}
          </tbody>
        </table>
      </div>
    </>
  );
}
