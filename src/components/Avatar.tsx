"use client";

import Link from "next/link";
import { useState } from "react";
import { useAvatarColor, useAvatarSrc } from "@/lib/avatar-store";
import { useIsOnline } from "@/lib/presence";
import styles from "./ui.module.css";

/**
 * Kulatý avatar: profilová fotka, když ji člověk má, jinak iniciály.
 * Čí je, se pozná z `userId`, z odkazu na profil (`/lide/<id>`), nebo u
 * `tone="me"` je to přihlášený uživatel.
 */
export function Avatar({
  initials,
  size = 36,
  tone = "student",
  href,
  title,
  userId,
  presence = false,
}: {
  initials: string;
  size?: number;
  tone?: "student" | "ucitel" | "admin" | "me" | "late" | "teal";
  /** Odkaz na profil člověka — avatar je pak klikací */
  href?: string;
  title?: string;
  userId?: string;
  /** Ukázat zelenou tečku, když je člověk online */
  presence?: boolean;
}) {
  const id = userId ?? href?.match(/^\/lide\/([^/?#]+)/)?.[1];
  const online = useIsOnline(presence ? id : null);
  const src = useAvatarSrc(id, tone === "me");
  const color = useAvatarColor(id, tone === "me");
  const [broken, setBroken] = useState<string | null>(null);
  const showPhoto = src && broken !== src;
  const props = {
    className: `${styles.avatar} ${styles[`avatar_${tone}`]}`,
    style: {
      width: size,
      height: size,
      borderRadius: size / 2,
      fontSize: size >= 44 ? 15 : size >= 40 ? 13 : 12,
      // Zvolená barva profilu obarví kolečko s iniciálami.
      ...(color ? { background: color, color: "#fff" } : {}),
    },
  };
  const inner = showPhoto ? (
    // eslint-disable-next-line @next/next/no-img-element -- malé obrázky přes vlastní adresu, optimalizace netřeba
    <img src={src} alt="" className={styles.avatarImg} onError={() => setBroken(src)} />
  ) : (
    initials
  );
  const avatar = href ? (
    <Link href={href} {...props} className={`${props.className} ${styles.avatarLink}`} aria-label={title ? `Profil: ${title}` : "Profil"} title={title}>
      {inner}
    </Link>
  ) : (
    <span {...props}>{inner}</span>
  );
  if (!presence) return avatar;
  return (
    <span className={styles.presence}>
      {avatar}
      {online && <span className={styles.onlineDot} style={{ width: size >= 40 ? 12 : 10, height: size >= 40 ? 12 : 10 }} role="img" aria-label="Online" title="Online" />}
    </span>
  );
}

/** Fotka přihlášeného (v hlavičce a v menu), jinak jeho iniciály. */
export function MyPhoto({ initials }: { initials: string }) {
  const src = useAvatarSrc(null, true);
  const color = useAvatarColor(null, true);
  const [broken, setBroken] = useState<string | null>(null);
  if (!src || broken === src) {
    return color ? (
      <span className={styles.avatarFill} style={{ background: color }}>
        {initials}
      </span>
    ) : (
      <>{initials}</>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- malé obrázky přes vlastní adresu
  return <img src={src} alt="" className={styles.avatarImg} onError={() => setBroken(src)} />;
}
