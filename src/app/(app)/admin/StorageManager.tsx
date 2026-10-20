"use client";

import { useState, useTransition } from "react";
import { runStorageCleanup } from "@/lib/actions/storage";
import { formatBytes, plural } from "@/lib/format";
import styles from "./admin.module.css";

export type StorageView = {
  buckets: { id: string; label: string; files: number; bytes: number }[];
  totalBytes: number;
  orphans: { files: number; bytes: number };
  young: { files: number; bytes: number };
};

/** Správa → Úložiště: kolik místa zabírají soubory a úklid nepoužívaných. */
export function StorageManager({ report, problem }: { report: StorageView | null; problem?: string }) {
  const [msg, setMsg] = useState<{ error?: string; info?: string }>({});
  const [pending, startTransition] = useTransition();

  const clean = () =>
    startTransition(async () => {
      setMsg(await runStorageCleanup());
    });

  return (
    <section aria-label="Úložiště souborů" className={`card ${styles.table}`}>
      <div className={styles.toolbar}>
        <div className={styles.grow}>
          <h2 className="section-title">Úložiště souborů</h2>
          <p className={styles.inviteNote}>
            Přílohy zpráv a chatů, nástěnky, úkolů a odevzdaných prací. Soubory, na které už nic neodkazuje (smazaná
            zpráva, příspěvek, úkol nebo tým, vyměněná profilová fotka), se mažou automaticky každou noc.
          </p>
        </div>
      </div>
      {!report ? (
        <p className={styles.footer}>{problem ?? "Přehled se nepodařilo načíst."}</p>
      ) : (
        <>
          {report.buckets.length === 0 && <p className={styles.footer}>Zatím tu nejsou žádné soubory.</p>}
          {report.buckets.map((b) => (
            <div key={b.id} className={styles.termRow}>
              <div className={styles.grow}>
                <strong>{b.label}</strong>
              </div>
              <span className={styles.inviteNote}>
                {b.files} {plural(b.files, "soubor", "soubory", "souborů")}
              </span>
              <strong className={styles.storageSize}>{formatBytes(b.bytes)}</strong>
            </div>
          ))}
          <div className={styles.courseRow}>
            <div className={styles.grow}>
              <strong>Celkem {formatBytes(report.totalBytes)}</strong>
              <p className={styles.inviteNote}>
                {report.orphans.files
                  ? `Ke smazání: ${report.orphans.files} ${plural(report.orphans.files, "nepoužívaný soubor", "nepoužívané soubory", "nepoužívaných souborů")} (${formatBytes(report.orphans.bytes)}).`
                  : report.young.files
                    ? "Teď není co mazat."
                    : "Žádné nepoužívané soubory."}
                {report.young.files > 0 &&
                  ` Dalších ${report.young.files} ${plural(report.young.files, "nepoužívaný soubor", "nepoužívané soubory", "nepoužívaných souborů")} (${formatBytes(report.young.bytes)}) je mladších než den — smažou se při nočním úklidu, až budou starší (mohly by se zrovna nahrávat).`}
              </p>
            </div>
            {report.orphans.files > 0 && (
              <button type="button" className="btn btn-outline" onClick={clean} disabled={pending}>
                {pending ? "Uklízím…" : "Uklidit teď"}
              </button>
            )}
          </div>
          {(msg.error || msg.info) && (
            <p role="status" className={`${styles.footer} ${msg.error ? styles.msgError : ""}`}>
              {msg.error ?? msg.info}
            </p>
          )}
        </>
      )}
    </section>
  );
}
