"use client";

// Udržuje čísla v menu (Úkoly, Hlasování, Zprávy) aktuální bez ručního obnovení:
// při nové notifikaci nebo nové zprávě od někoho jiného si stránka znovu
// načte data ze serveru (router.refresh zachová rozepsané věci na stránce).
// Navíc při návratu do karty, pokud od posledního obnovení uběhla minuta.

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const DEBOUNCE_MS = 1200;
const STALE_MS = 60_000;

export function LiveRefresh({ userId, live }: { userId: string; live: boolean }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(0);

  useEffect(() => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      // Víc událostí rychle za sebou (zpráva + její notifikace) = jedno obnovení.
      timer.current = setTimeout(() => {
        last.current = Date.now();
        router.refresh();
      }, DEBOUNCE_MS);
    };
    last.current = Date.now();

    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current > STALE_MS) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    let cancelled = false;
    const sb = live ? createClient() : null;
    const channel = sb
      ?.channel(`menu-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const r = payload.new as { author_id?: string; system?: boolean };
        if (r.author_id !== userId && !r.system) refresh();
      })
      // Nové nebo zrušené přání → číslo u Hlasování.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wishes" }, (payload) => {
        if ((payload.new as { author_id?: string }).author_id !== userId) refresh();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "wishes" }, refresh);
    if (sb && channel) {
      void sb.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        if (data.session) sb.realtime.setAuth(data.session.access_token);
        channel.subscribe();
      });
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
      if (sb && channel) void sb.removeChannel(channel);
    };
  }, [userId, live, router]);

  return null;
}
