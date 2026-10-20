"use client";

import { useEffect } from "react";
import { setAvatarState } from "@/lib/avatar-store";

/** Předá avatarům na stránce, kdo má profilovou fotku a jakou barvu profilu. */
export function AvatarState({ map, colors, meId }: { map: Record<string, string>; colors: Record<string, string>; meId: string }) {
  useEffect(() => {
    setAvatarState({ map, colors, meId });
  }, [map, colors, meId]);
  return null;
}
