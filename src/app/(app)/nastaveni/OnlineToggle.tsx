"use client";

import { useState, useTransition } from "react";
import { setShowOnline } from "@/lib/actions/profile";
import styles from "@/components/manage/manage.module.css";

/** Nastavení → Soukromí: ukazovat ostatním zelenou tečku „online“. */
export function OnlineToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [msg, setMsg] = useState<{ error?: string; info?: string }>({});
  const [pending, start] = useTransition();

  const change = (next: boolean) => {
    setOn(next);
    start(async () => {
      const res = await setShowOnline(next);
      setMsg(res);
      if (res.error) setOn(!next);
    });
  };

  return (
    <section className={`card ${styles.form}`} aria-label="Soukromí">
      <div>
        <h2 className="section-title">Soukromí</h2>
      </div>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", minHeight: 44 }}>
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(e) => change(e.target.checked)}
          style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--primary)", flex: "none" }}
        />
        <span>
          <strong style={{ display: "block", fontSize: 14 }}>Ukazovat, že jsem online</strong>
          <span className={styles.hint}>
            Ostatní u tebe uvidí zelenou tečku, když máš aplikaci otevřenou. Když to vypneš, budeš pro ostatní vypadat offline, ale sám dál uvidíš, kdo je online.
          </span>
        </span>
      </label>
      {(msg.error || msg.info) && (
        <p role="status" className={msg.error ? styles.formError : styles.formInfo}>
          {msg.error ?? msg.info}
        </p>
      )}
    </section>
  );
}
