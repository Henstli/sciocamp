"use client";

import { useState, useTransition } from "react";
import { setDueReminders, setHomeDueAlerts, setShowOnline } from "@/lib/actions/profile";
import styles from "@/components/manage/manage.module.css";

const SETTINGS = {
  online: {
    label: "Ukazovat, že jsem online",
    hint: "Ostatní u tebe uvidí zelenou tečku, když máš aplikaci otevřenou. Když to vypneš, budeš pro ostatní vypadat offline, ale sám dál uvidíš, kdo je online.",
    save: setShowOnline,
  },
  terminy: {
    label: "Připomínat blížící se termín úkolu ve zvonečku",
    hint: "Den před termínem ti přijde upozornění ve zvonečku, pokud úkol ještě nemáš odevzdaný.",
    save: setDueReminders,
  },
  domov: {
    label: "Ukazovat blížící se termíny na Domově",
    hint: "Nahoře na Domově uvidíš úkoly, kterým do 24 hodin končí termín a ještě je nemáš odevzdané.",
    save: setHomeDueAlerts,
  },
} as const;

/** Jedna volba v Nastavení (ukládá se hned po kliknutí). */
function SettingToggle({ kind, initial }: { kind: keyof typeof SETTINGS; initial: boolean }) {
  const cfg = SETTINGS[kind];
  const [on, setOn] = useState(initial);
  const [msg, setMsg] = useState<{ error?: string; info?: string }>({});
  const [pending, start] = useTransition();

  const change = (next: boolean) => {
    setOn(next);
    start(async () => {
      const res = await cfg.save(next);
      setMsg(res);
      if (res.error) setOn(!next);
    });
  };

  return (
    <div>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", minHeight: 44 }}>
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(e) => change(e.target.checked)}
          style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--primary)", flex: "none" }}
        />
        <span>
          <strong style={{ display: "block", fontSize: 14 }}>{cfg.label}</strong>
          <span className={styles.hint}>{cfg.hint}</span>
        </span>
      </label>
      {(msg.error || msg.info) && (
        <p role="status" className={msg.error ? styles.formError : styles.formInfo} style={{ marginLeft: 32 }}>
          {msg.error ?? msg.info}
        </p>
      )}
    </div>
  );
}

/** Nastavení → Upozornění a soukromí. */
export function OnlineToggle({
  initial,
  dueReminders,
  homeDueAlerts,
}: {
  initial: boolean;
  /** Jen u studentů */
  dueReminders?: boolean;
  homeDueAlerts?: boolean;
}) {
  return (
    <section className={`card ${styles.form}`} aria-label="Upozornění a soukromí">
      <div>
        <h2 className="section-title">{dueReminders === undefined ? "Soukromí" : "Upozornění a soukromí"}</h2>
      </div>
      {dueReminders !== undefined && <SettingToggle kind="terminy" initial={dueReminders} />}
      {homeDueAlerts !== undefined && <SettingToggle kind="domov" initial={homeDueAlerts} />}
      <SettingToggle kind="online" initial={initial} />
    </section>
  );
}
