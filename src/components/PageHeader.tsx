import Link from "next/link";
import { NotificationBell } from "./NotificationBell";
import { Avatar, MyPhoto } from "./Avatar";

export { Avatar };
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
          <MyPhoto initials={avatar.initials} />
        </Link>
      )}
    </header>
  );
}

/** Adresa profilu člověka. */
export const profileHref = (id: string) => `/lide/${id}`;

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}
