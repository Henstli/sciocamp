"use client";

// Sleduje, kdo je online (soukromý Realtime kanál „online“, oprávnění v RLS na
// realtime.messages), a pokud to člověk v Nastavení nevypnul (`visible`), hlásí
// i jeho. Člověk je online, dokud má aplikaci otevřenou v některé kartě.

import { useEffect, useRef } from "react";
import { setOnline } from "@/lib/presence";
import { createClient } from "@/lib/supabase/client";

/** V ukázkovém režimu: pár lidí „online“, ať je vidět, jak to vypadá. */
const DEMO_ONLINE = ["u-komarek", "u-jakubcova", "u-kolarova"];

type Channel = ReturnType<ReturnType<typeof createClient>["channel"]>;

export function PresenceTracker({ userId, live, visible = true }: { userId: string; live: boolean; visible?: boolean }) {
  const channelRef = useRef<Channel | null>(null);
  const joined = useRef(false);
  const visibleRef = useRef(visible);

  useEffect(() => {
    if (!live) {
      setOnline(visible ? [userId, ...DEMO_ONLINE] : DEMO_ONLINE);
      return;
    }
    const sb = createClient();
    let cancelled = false;
    const channel = sb.channel("online", { config: { private: true, presence: { key: userId } } });
    channelRef.current = channel;
    channel.on("presence", { event: "sync" }, () => {
      setOnline(Object.keys(channel.presenceState()));
    });
    void sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) sb.realtime.setAuth(data.session.access_token);
      channel.subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        joined.current = true;
        if (visibleRef.current) void channel.track({ at: new Date().toISOString() });
      });
    });
    return () => {
      cancelled = true;
      joined.current = false;
      channelRef.current = null;
      setOnline([]);
      void sb.removeChannel(channel);
    };
    // `visible` řeší druhý efekt bez odpojení kanálu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, live]);

  // Přepnutí v Nastavení: ohlásit se, nebo se schovat.
  useEffect(() => {
    visibleRef.current = visible;
    const ch = channelRef.current;
    if (!live || !ch || !joined.current) return;
    if (visible) void ch.track({ at: new Date().toISOString() });
    else void ch.untrack();
  }, [visible, live]);

  return null;
}
