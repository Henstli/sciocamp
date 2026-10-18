import Link from "next/link";
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
}: {
  initials: string;
  size?: number;
  tone?: "student" | "ucitel" | "admin" | "me" | "late" | "teal";
}) {
  return (
    <span
      className={`${styles.avatar} ${styles[`avatar_${tone}`]}`}
      style={{ width: size, height: size, borderRadius: size / 2, fontSize: size >= 44 ? 15 : size >= 40 ? 13 : 12 }}
    >
      {initials}
    </span>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}
