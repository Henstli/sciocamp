"use client";

// Důležité oznámení od admina zvýrazněné nahoře na Domově. Každý si ho může skrýt.

import { useState, useTransition } from "react";
import { Icon } from "../Icon";
import { dismissAnnouncement } from "@/lib/actions/announcements";
import styles from "./announcements.module.css";

export type BannerAnnouncement = { id: string; title: string; body: string; linkUrl: string | null; meta: string };

export function AnnouncementBanner({ item }: { item: BannerAnnouncement }) {
  const [hidden, setHidden] = useState(false);
  const [pending, start] = useTransition();
  if (hidden) return null;

  return (
    <section className={styles.banner} aria-label={`Oznámení: ${item.title}`}>
      <div className={styles.icon}>
        <Icon name="bell" size={22} />
      </div>
      <div className={styles.body}>
        <div className={styles.label}>Důležité oznámení</div>
        <h2 className={styles.title}>{item.title}</h2>
        {item.body && <p className={styles.text}>{item.body}</p>}
        <div className={styles.foot}>
          <span className={styles.meta}>{item.meta}</span>
          {item.linkUrl && (
            <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" className={styles.link}>
              <Icon name="link" size={16} /> Otevřít odkaz
            </a>
          )}
        </div>
      </div>
      <button
        type="button"
        className={styles.dismiss}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setHidden(true);
            const res = await dismissAnnouncement(item.id);
            if (res.error) setHidden(false);
          })
        }
      >
        Rozumím
      </button>
    </section>
  );
}
