"use client";

// Zvoneček s notifikacemi. Data si načte sám (serverová akce) a naostro
// přijímá nové notifikace živě přes Supabase Realtime.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { loadNotifications, markNotificationsRead, type BellItem } from "@/lib/actions/communication";
import { createClient } from "@/lib/supabase/client";
import { formatStamp } from "@/lib/time";
import styles from "./NotificationBell.module.css";

const KIND_ICON: Record<string, IconName> = {
  ukol: "file",
  material: "play",
  oznameni: "bell",
  komentar: "comment",
  hodnoceni: "check",
  odevzdani: "upload",
  zprava: "chat",
  zapis: "clipboard",
  navrh: "bulb",
  prani: "vote",
  konzultace: "clock",
};

type Row = { id: string; kind: string; title: string; body: string | null; href: string | null; created_at: string; read_at: string | null };

export function NotificationBell() {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<BellItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<{ userId: string; live: boolean } | null>(null);
  const unread = items.filter((i) => !i.read).length;

  useEffect(() => {
    let alive = true;
    loadNotifications()
      .then((res) => {
        if (!alive) return;
        setItems(res.items);
        setSession({ userId: res.userId, live: res.live });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  // Nové notifikace naživo.
  useEffect(() => {
    if (!session?.live) return;
    const sb = createClient();
    let cancelled = false;
    const channel = sb.channel(`notifikace-${session.userId}`).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${session.userId}` },
      (payload) => {
        const r = payload.new as Row;
        setItems((list) =>
          list.some((x) => x.id === r.id)
            ? list
            : [{ id: r.id, kind: r.kind, title: r.title, body: r.body, href: r.href, when: formatStamp(r.created_at, new Date()), read: false }, ...list],
        );
      },
    );
    void sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) sb.realtime.setAuth(data.session.access_token);
      channel.subscribe();
    });
    return () => {
      cancelled = true;
      void sb.removeChannel(channel);
    };
  }, [session]);

  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  function openItem(item: BellItem) {
    setItems((list) => list.map((x) => (x.id === item.id ? { ...x, read: true } : x)));
    if (!item.read) void markNotificationsRead([item.id]);
    setOpen(false);
    if (item.href) router.push(item.href);
  }

  function readAll() {
    setItems((list) => list.map((x) => ({ ...x, read: true })));
    void markNotificationsRead();
  }

  return (
    <div className={styles.wrap} ref={box}>
      <button
        type="button"
        className={styles.bell}
        aria-label={unread > 0 ? `Notifikace, ${unread} nepřečtené` : "Notifikace"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" />
        {unread > 0 && <span className={styles.count}>{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="Notifikace">
          <div className={styles.head}>
            <span className={styles.title}>Notifikace</span>
            {unread > 0 && (
              <button type="button" className={styles.readAll} onClick={readAll}>
                Označit vše jako přečtené
              </button>
            )}
          </div>
          {!loaded && <p className={styles.empty}>Načítám…</p>}
          {loaded && items.length === 0 && <p className={styles.empty}>Zatím žádné notifikace. Ozveme se, až přibude úkol, oznámení nebo hodnocení.</p>}
          <ul className={styles.list}>
            {items.map((n) => (
              <li key={n.id}>
                <button type="button" className={styles.item} data-unread={!n.read} onClick={() => openItem(n)}>
                  <span className={styles.icon} data-kind={n.kind}>
                    <Icon name={KIND_ICON[n.kind] ?? "bell"} size={18} />
                  </span>
                  <span className={styles.text}>
                    <span className={styles.itemTitle}>{n.title}</span>
                    {n.body && <span className={styles.itemBody}>{n.body}</span>}
                    <span className={styles.when}>{n.when}</span>
                  </span>
                  {!n.read && <span className={styles.dot} aria-label="nepřečtené" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
