"use client";

import { useEffect } from "react";
import { setAvatarState } from "@/lib/avatar-store";

/** Předá avatarům na stránce, kdo má profilovou fotku. */
export function AvatarState({ map, meId }: { map: Record<string, string>; meId: string }) {
  useEffect(() => {
    setAvatarState({ map, meId });
  }, [map, meId]);
  return null;
}
