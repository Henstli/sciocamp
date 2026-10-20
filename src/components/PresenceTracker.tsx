"use client";

// Hlásí, že je přihlášený online, a sleduje, kdo další je online
// (soukromý Realtime kanál „online“, oprávnění v RLS na realtime.messages).
// Člověk je online, dokud má aplikaci otevřenou v některé kartě.

import { useEffect } from "react";
import { setOnline } from "@/lib/presence";
import { createClient } from "@/lib/supabase/client";

/** V ukázkovém režimu: pár lidí „online“, ať je vidět, jak to vypadá. */
const DEMO_ONLINE = ["u-komarek", "u-jakubcova", "u-kolarova"];

export function PresenceTracker({ userId, live }: { userId: string; live: boolean }) {
  useEffect(() => {
    if (!live) {
      setOnline([userId, ...DEMO_ONLINE]);
      return;
    }
    const sb = createClient();
    let cancelled = false;
    const channel = sb.channel("online", { config: { private: true, presence: { key: userId } } });
    channel.on("presence", { event: "sync" }, () => {
      setOnline(Object.keys(channel.presenceState()));
    });
    void sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) sb.realtime.setAuth(data.session.access_token);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ at: new Date().toISOString() });
      });
    });
    return () => {
      cancelled = true;
      setOnline([]);
      void sb.removeChannel(channel);
    };
  }, [userId, live]);
  return null;
}
