import Link from "next/link";
import type { HelpFeedbackRow } from "@/lib/data-help";
import styles from "./admin.module.css";

/** Správa → Nástroje: kolik lidem který návod pomohl. */
export function HelpFeedbackTable({ rows, live }: { rows: HelpFeedbackRow[]; live: boolean }) {
  return (
    <section aria-label="Nápověda" className={`card ${styles.table}`}>
      <div className={styles.toolbar}>
        <div className={styles.grow}>
          <h2 className="section-title">Nápověda</h2>
          <p className={styles.inviteNote}>
            Odpovědi na „Pomohl ti návod?“. Návod s víc odpověďmi „Ne“ stojí za to přepsat.
            {!live && " Ukázkový režim: odpovědi se neukládají."}
          </p>
        </div>
        <Link href="/napoveda" className="btn btn-outline">
          Otevřít Nápovědu
        </Link>
      </div>
      {rows.map((r) => (
        <div key={r.slug} className={styles.termRow}>
          <div className={styles.grow}>
            <Link href={`/napoveda/${r.slug}`} style={{ color: "inherit", fontWeight: 700 }}>
              {r.title}
            </Link>
          </div>
          <span className="chip chip-ok">Ano {r.yes}</span>
          <span className={`chip ${r.no > r.yes ? "chip-late" : "chip-info"}`}>Ne {r.no}</span>
        </div>
      ))}
    </section>
  );
}
