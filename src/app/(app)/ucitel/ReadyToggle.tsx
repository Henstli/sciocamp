"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { setPeriodReady } from "@/lib/actions/periods";
import styles from "./ucitel.module.css";

/** Učitel potvrdí, že má kurzy v období připravené (admin pak období zveřejní). */
export function ReadyToggle({ periodId, ready }: { periodId: string; ready: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; info?: string }>({});
  return (
    <div className={styles.readyBox}>
      {ready ? (
        <>
          <span className={styles.readyDone}>
            <Icon name="tick" size={16} strokeWidth={2.6} /> Máš hotovo
          </span>
          <button type="button" className="btn btn-outline" disabled={pending} onClick={() => start(async () => setMsg(await setPeriodReady(periodId, false)))}>
            Ještě upravuji
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => start(async () => setMsg(await setPeriodReady(periodId, true)))}>
          {pending ? "Ukládám…" : "Mám hotovo"}
        </button>
      )}
      {(msg.error || msg.info) && (
        <span role="status" className={msg.error ? styles.readyError : styles.readyInfo}>
          {msg.error ?? msg.info}
        </span>
      )}
    </div>
  );
}
