// Stavební kameny Statistik studentů: dlaždice s číslem, pruh úspěšnosti,
// týdenní graf a přepínače období. Vše bez klientského JS.

import Link from "next/link";
import type { CompletionSummary } from "@/lib/completion";
import { pct, type Week } from "@/lib/stats";
import type { ActivityKind } from "@/lib/types";
import styles from "./stats.module.css";

/** Barva podle úspěšnosti: ≥ 85 % dobře, ≥ 70 % pozor, jinak špatně */
export function rateTone(v: number | null): "ok" | "wait" | "late" | "none" {
  if (v === null) return "none";
  return v >= 0.85 ? "ok" : v >= 0.7 ? "wait" : "late";
}

export function StatTile({
  label,
  value,
  rate,
  sub,
  compare,
  tone,
  hint,
}: {
  label: string;
  /** Hlavní číslo (např. „86 %“ nebo „12“) */
  value: string;
  /** Podíl 0–1 — ukáže pruh a obarví číslo */
  rate?: number | null;
  sub?: string;
  /** Srovnání se školou: „škola 82 %“ a rozdíl */
  compare?: { label: string; diff: number | null };
  tone?: "ok" | "wait" | "late" | "none";
  hint?: string;
}) {
  const t = tone ?? (rate !== undefined ? rateTone(rate) : "none");
  return (
    <div className={`card ${styles.tile}`} data-tone={t} title={hint}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue}>{value}</span>
      {rate !== undefined && <RateBar value={rate} />}
      {sub && <span className={styles.tileSub}>{sub}</span>}
      {compare && (
        <span className={styles.compare}>
          {compare.label}
          {compare.diff !== null && Math.abs(compare.diff) >= 0.01 && (
            <b data-up={compare.diff > 0 || undefined}>
              {compare.diff > 0 ? "▲" : "▼"} o {Math.round(Math.abs(compare.diff) * 100)} % {compare.diff > 0 ? "víc" : "míň"}
            </b>
          )}
        </span>
      )}
    </div>
  );
}

/** Vodorovný pruh 0–100 % v barvě podle úspěšnosti */
export function RateBar({ value, label }: { value: number | null; label?: string }) {
  return (
    <span className={styles.bar} data-tone={rateTone(value)} role="img" aria-label={label ?? pct(value)}>
      <span style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
    </span>
  );
}

/** Pruh s procenty vedle sebe (do tabulek) */
export function RateCell({ value, detail }: { value: number | null; detail?: string }) {
  return (
    <span className={styles.rateCell} title={detail}>
      <span className={styles.rateNum} data-tone={rateTone(value)}>
        {pct(value)}
      </span>
      <RateBar value={value} />
    </span>
  );
}

/** Týdenní průběh: skládaný sloupec včas / pozdě / chybí */
export function WeeklyChart({ weeks, title }: { weeks: Week[]; title: string }) {
  const max = Math.max(1, ...weeks.map((w) => w.onTime + w.late + w.missing));
  const total = weeks.reduce((n, w) => n + w.onTime + w.late + w.missing, 0);
  return (
    <figure className={styles.chart} aria-label={title}>
      {total === 0 ? (
        <p className={styles.muted}>V tomto období zatím neprošel termín žádného úkolu.</p>
      ) : (
        <div className={styles.cols} style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
          {weeks.map((w) => {
            const sum = w.onTime + w.late + w.missing;
            const h = (n: number) => `${(n / max) * 100}%`;
            return (
              <div
                key={w.monday}
                className={styles.col}
                title={`Týden od ${w.label}: včas ${w.onTime}, pozdě ${w.late}, chybí ${w.missing}`}
              >
                <div className={styles.stack}>
                  {sum === 0 && <span className={styles.emptyCol} />}
                  {w.missing > 0 && <span data-k="missing" style={{ height: h(w.missing) }} />}
                  {w.late > 0 && <span data-k="late" style={{ height: h(w.late) }} />}
                  {w.onTime > 0 && <span data-k="ontime" style={{ height: h(w.onTime) }} />}
                </div>
                <span className={styles.colRate}>{sum ? pct(w.onTime / sum) : ""}</span>
                <span className={styles.colLabel}>{w.label}</span>
              </div>
            );
          })}
        </div>
      )}
      <figcaption className={styles.legend}>
        <span>
          <i data-k="ontime" />
          Odevzdáno včas
        </span>
        <span>
          <i data-k="late" />
          Pozdě
        </span>
        <span>
          <i data-k="missing" />
          Chybí / vráceno
        </span>
        <span className={styles.legendNote}>% = podíl odevzdaných včas v týdnu (podle termínu)</span>
      </figcaption>
    </figure>
  );
}

/** Přepínač (odkazy s parametrem v adrese) */
export function LinkTabs({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string; on: boolean }[];
}) {
  return (
    <nav className={`tablist ${styles.tabs}`} aria-label={label}>
      {items.map((i) => (
        <Link key={i.href} href={i.href} className="tab" aria-current={i.on ? "true" : undefined} scroll={false}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/** Karta splnění jednoho druhu aktivit (kurzy / ateliéry / expedice) */
export function CompletionCard({ kind, label, summary: s }: { kind: ActivityKind; label: string; summary: CompletionSummary }) {
  const tone = rateTone(s.rate);
  return (
    <div className={`card ${styles.kindCard}`} data-kind={kind}>
      <span className={styles.kindLabel}>
        <i className={styles.kindDot} data-kind={kind} aria-hidden="true" />
        {label}
      </span>
      {s.total === 0 ? (
        <span className={styles.muted}>V tomto období žádné.</span>
      ) : (
        <>
          {s.rate === null ? (
            <span className={styles.kindValue} data-tone="none">
              <small>Zatím nic ohodnocené</small>
            </span>
          ) : (
            <span className={styles.kindValue} data-tone={tone}>
              {pct(s.rate)}
              <small>splněno</small>
            </span>
          )}
          <span className={styles.stackBar} role="img" aria-label={`Splněno ${s.splneno}, nesplněno ${s.nesplneno}, čeká ${s.ceka}, probíhá ${s.probiha}`}>
            <span data-k="ok" style={{ flexGrow: s.splneno }} />
            <span data-k="late" style={{ flexGrow: s.nesplneno }} />
            <span data-k="wait" style={{ flexGrow: s.ceka }} />
            <span data-k="run" style={{ flexGrow: s.probiha }} />
          </span>
          <span className={styles.kindCounts}>
            <span data-k="ok">{s.splneno} splněno</span>
            <span data-k="late">{s.nesplneno} nesplněno</span>
            {s.ceka > 0 && <span data-k="wait">{s.ceka} čeká na hodnocení</span>}
            {s.probiha > 0 && <span data-k="run">{s.probiha} probíhá</span>}
          </span>
        </>
      )}
    </div>
  );
}

/** Buňka tabulky: „3 ✓ 1 ✗ 1 …“ (splněno, nesplněno, čeká) */
export function CountCell({ summary: s }: { summary: CompletionSummary }) {
  if (s.total === 0) return <span className={styles.zero}>–</span>;
  return (
    <span className={styles.countCell}>
      {(s.splneno > 0 || s.nesplneno > 0) && (
        <span data-k="ok" title="Splněno">
          {s.splneno} ✓
        </span>
      )}
      {s.nesplneno > 0 && (
        <span data-k="late" title="Nesplněno">
          {s.nesplneno} ✗
        </span>
      )}
      {s.ceka > 0 && (
        <span data-k="wait" title="Čeká na hodnocení">
          {s.ceka} čeká
        </span>
      )}
      {s.probiha > 0 && (
        <span data-k="run" title="Probíhá">
          {s.probiha} běží
        </span>
      )}
    </span>
  );
}
