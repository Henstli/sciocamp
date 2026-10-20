// Kdo má profilovou fotku (id → verze). Plní ji layout aplikace, čtou ji avatary
// kdekoli na stránce (i v jiných hranicích <Suspense>).

import { useSyncExternalStore } from "react";

type State = { map: Record<string, string>; meId: string | null };
let state: State = { map: {}, meId: null };
const listeners = new Set<() => void>();

export function setAvatarState(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Adresa fotky člověka, nebo null (pak se ukážou iniciály). `null` id = přihlášený. */
export function useAvatarSrc(userId: string | null | undefined, me = false): string | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      const id = userId ?? (me ? state.meId : null);
      const version = id ? state.map[id] : undefined;
      return id && version ? `/api/avatar/${id}?v=${encodeURIComponent(version)}` : null;
    },
    () => null,
  );
}
