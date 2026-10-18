import Link from "next/link";
import { NotificationBell } from "./NotificationBell";
import styles from "./ui.module.css";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  children,
  avatar,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  avatar?: { initials: string; name: string };
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerText}>
        {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
        <h1 className={styles.h1}>{title}</h1>
        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
      </div>
      {children}
      {avatar && <NotificationBell />}
      {avatar && (
        <Link href="/profil" aria-label={`Profil: ${avatar.name}`} className={styles.headerAvatar}>
          {avatar.initials}
        </Link>
      )}
    </header>
  );
}

export function Avatar({
  initials,
  size = 36,
  tone = "student",
  href,
  title,
}: {
  initials: string;
  size?: number;
  tone?: "student" | "ucitel" | "admin" | "me" | "late" | "teal";
  /** Odkaz na profil člověka — avatar je pak klikací */
  href?: string;
  title?: string;
}) {
  const props = {
    className: `${styles.avatar} ${styles[`avatar_${tone}`]}`,
    style: { width: size, height: size, borderRadius: size / 2, fontSize: size >= 44 ? 15 : size >= 40 ? 13 : 12 },
  };
  if (href) {
    return (
      <Link href={href} {...props} className={`${props.className} ${styles.avatarLink}`} aria-label={title ? `Profil: ${title}` : "Profil"} title={title}>
        {initials}
      </Link>
    );
  }
  return <span {...props}>{initials}</span>;
}

/** Adresa profilu člověka. */
export const profileHref = (id: string) => `/lide/${id}`;

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}
