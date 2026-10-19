import Link from "next/link";
import { Avatar, profileHref } from "../PageHeader";
import styles from "./assignment.module.css";

export type TeamMember = {
  id: string;
  name: string;
  initials: string;
  /** Přihlášený uživatel (zvýrazní se a dostane „ty“) */
  me?: boolean;
  /** Kam vede klik na jméno (výchozí: profil) */
  href?: string;
  /** Vybraný člen (např. u hodnocení) */
  current?: boolean;
  /** Stav práce u vyučujícího */
  chip?: { label: string; className: string };
  /** Drobná poznámka, např. „hodnoceno jednotlivě“ */
  note?: string;
};

/** Členové týmu jako řada avatarů se jmény — aby bylo hned vidět, kdo v týmu je. */
export function TeamMembers({ members, compact = false }: { members: TeamMember[]; compact?: boolean }) {
  if (members.length === 0) return <p className={styles.small}>V týmu zatím nikdo není.</p>;
  return (
    <ul className={styles.members} data-compact={compact || undefined} aria-label="Členové týmu">
      {members.map((m) => (
        <li key={m.id} className={styles.member} data-me={m.me || undefined} data-current={m.current || undefined}>
          <Avatar initials={m.initials} size={compact ? 28 : 32} tone={m.me ? "me" : "student"} href={profileHref(m.id)} title={m.name} />
          <span className={styles.memberText}>
            <Link href={m.href ?? profileHref(m.id)} scroll={m.href ? false : undefined} className={styles.memberName}>
              {m.name}
              {m.me && <span className={styles.memberMe}> (ty)</span>}
            </Link>
            {m.note && <span className={styles.memberNote}>{m.note}</span>}
          </span>
          {m.chip && <span className={`chip ${m.chip.className}`}>{m.chip.label}</span>}
        </li>
      ))}
    </ul>
  );
}
