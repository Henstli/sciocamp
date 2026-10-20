// Kdo je právě online (Supabase Realtime Presence, kanál „online“).
// Plní ji PresenceTracker v layoutu, čtou ji avatary a hlavičky chatů.

import { useSyncExternalStore } from "react";

let online = new Set<string>();
const listeners = new Set<() => void>();

export function setOnline(ids: Iterable<string>) {
  const next = new Set(ids);
  if (next.size === online.size && [...next].every((id) => online.has(id))) return;
  online = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Je člověk právě online? */
export function useIsOnline(userId: string | null | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !!userId && online.has(userId),
    () => false,
  );
}

/** Kolik z daných lidí je online. */
export function useOnlineCount(userIds: string[]): number {
  return useSyncExternalStore(
    subscribe,
    () => userIds.filter((id) => online.has(id)).length,
    () => 0,
  );
}
