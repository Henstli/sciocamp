"use client";

import { useState } from "react";
import styles from "@/app/(app)/profil/profil.module.css";

/** Text s tlačítkem „Kopírovat“ (Discord nemá odkaz na profil podle jména). */
export function CopyText({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className={styles.copyRow}>
      <span>{text}</span>
      <button
        type="button"
        className={styles.copyBtn}
        aria-label={`Zkopírovat ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Zkopírováno" : "Kopírovat"}
      </button>
    </span>
  );
}
