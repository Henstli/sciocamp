"use client";

// Správa → Nástroje → Wrap: kdy se spustí, přehrání (můj, ukázky)
// a zkouška celého spuštění jen na mně.

import { useState, useTransition } from "react";
import { DueInput } from "@/components/fields/DateTime";
import { WrapButton } from "@/components/wrap/WrapPlayer";
import { setWrapLaunch, setWrapTrial } from "@/lib/actions/wrap";
import { WRAP_DAYS } from "@/lib/wrap";
import styles from "./admin.module.css";

export function WrapTools({
  live,
  launchLocal,
  launchText,
  untilText,
  active,
  trial,
  season,
}: {
  live: boolean;
  /** Spuštění „rrrr-mm-ddThh:mm“ (pražský čas) */
  launchLocal: string;
  launchText: string;
  untilText: string;
  active: boolean;
  trial: boolean;
  season: number;
}) {
  const [msg, setMsg] = useState<{ error?: string; info?: string }>({});
  const [pending, start] = useTransition();

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get("launch") ?? "");
    start(async () => setMsg(await setWrapLaunch(value)));
  };
  const toggleTrial = () =>
    start(async () => {
      const res = await setWrapTrial(!trial);
      setMsg(res.error ? res : { info: trial ? "Zkouška je zrušená." : "Zkouška běží: wrap se ti teď sám otevře a najdeš ho v profilu." });
    });

  const status = trial
    ? { label: "Zkouška na tobě", cls: "chip-wait" }
    : active
      ? { label: "Běží", cls: "chip-ok" }
      : { label: "Naplánováno", cls: "chip-primary" };

  return (
    <section aria-label="Wrap" className={`card ${styles.table}`}>
      <div className={styles.toolbar}>
        <span className={styles.wrapIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
          </svg>
        </span>
        <div className={styles.grow}>
          <h2 className="section-title">Wrap – rok v Campu {season ? `${season}/${String((season + 1) % 100).padStart(2, "0")}` : ""}</h2>
          <p className={styles.inviteNote}>
            Shrnutí školního roku pro studenty i vyučující, každému podle role. Po spuštění se každému jednou samo
            otevře a pak ho {WRAP_DAYS} dní najde ve svém profilu.
          </p>
        </div>
        <span className={`chip ${status.cls}`}>{status.label}</span>
      </div>

      <form className={styles.wrapBlock} onSubmit={save}>
        <strong>Spuštění pro všechny</strong>
        <div className={styles.wrapRow}>
          <DueInput key={launchLocal} name="launch" defaultValue={launchLocal} defaultTime="08:00" label="spuštění wrapu" />
          <button type="submit" className="btn btn-outline" disabled={pending}>
            Uložit
          </button>
        </div>
        <p className={styles.inviteNote}>
          Teď: {launchText}, v profilu do {untilText}. Data se počítají od 1. 9. do dne spuštění.
          {!live && " Ukázkový režim: nastavení platí jen v tomto prohlížeči."}
        </p>
      </form>

      <div className={styles.wrapBlock}>
        <strong>Vyzkoušet před spuštěním (vidíš jen ty)</strong>
        <div className={styles.wrapRow}>
          <WrapButton mode="mine">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M7 5v14l11-7z" fill="currentColor" />
            </svg>
            Přehrát můj wrap
          </WrapButton>
          <WrapButton mode="student" className="btn btn-outline">
            Ukázka pro studenta
          </WrapButton>
          <WrapButton mode="staff" className="btn btn-outline">
            Ukázka pro učitele
          </WrapButton>
        </div>
        <p className={styles.inviteNote}>
          „Můj wrap“ jsou tvoje skutečná data od 1. 9. do dneška. Ukázky mají vymyšlená čísla.
        </p>
      </div>

      <div className={styles.wrapBlock}>
        <div className={styles.trialBox} data-on={trial || undefined}>
          <div className={styles.grow}>
            <strong>Vyzkoušet spuštění na mně</strong>
            <p className={styles.inviteNote}>
              {trial
                ? "Běží: wrap se ti otevřel jako ostatním při spuštění a je v profilu. Ostatní nic nevidí."
                : "Projdeš celé spuštění jako ostatní: samo otevřené okno, zavření, pruh v profilu. Kdykoli jde zrušit."}
            </p>
          </div>
          <button type="button" className="btn btn-outline" onClick={toggleTrial} disabled={pending} data-danger={trial || undefined}>
            {trial ? "Zrušit zkoušku" : "Spustit na mně"}
          </button>
        </div>
        {(msg.error || msg.info) && (
          <p role="status" className={msg.error ? styles.msgError : styles.inviteNote}>
            {msg.error ?? msg.info}
          </p>
        )}
      </div>
    </section>
  );
}
