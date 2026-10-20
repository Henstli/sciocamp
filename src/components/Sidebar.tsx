"use client";

import Link from "next/link";
import { MyPhoto } from "./Avatar";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "./Icon";
import { logout } from "@/app/prihlaseni/actions";
import styles from "./Sidebar.module.css";

type NavItem = { href: string; label: string; icon: IconName; badge?: number; badgeTone?: "accent" };
type NavGroup = { title: string; items: NavItem[] };

export type SidebarProps = {
  user: { name: string; initials: string; caption: string };
  showTeach: boolean;
  showAdmin: boolean;
  badges: { ukoly?: number; hlasovani?: number; zpravy?: number; vyuka?: number };
};

export function Sidebar({ user, showTeach, showAdmin, badges }: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);


  const groups: NavGroup[] = [
    {
      title: "Přehled",
      items: [
        { href: "/", label: "Domov", icon: "home" },
        { href: "/zapisy", label: "Zápisy", icon: "clipboard" },
        { href: "/ukoly", label: "Úkoly", icon: "check", badge: badges.ukoly },
        { href: "/hlasovani", label: "Hlasování", icon: "vote", badge: badges.hlasovani },
        { href: "/zpravy", label: "Zprávy", icon: "chat", badge: badges.zpravy },
      ],
    },
    {
      title: "Škola",
      items: [
        { href: "/kurzy", label: "Kurzy", icon: "book" },
        { href: "/ateliery", label: "Ateliéry", icon: "shapes" },
        { href: "/udalosti", label: "Události", icon: "calendar" },
        { href: "/expedice", label: "Expedice", icon: "mountain" },
        { href: "/konzultace", label: "Konzultace", icon: "clock" },
        { href: "/navrhy", label: "Návrhy", icon: "bulb" },
      ],
    },
  ];
  if (showTeach) {
    groups.push({
      title: "Výuka",
      items: [{ href: "/ucitel", label: "Moje třídy", icon: "monitor", badge: badges.vyuka, badgeTone: "accent" }],
    });
  }
  if (showAdmin) {
    groups.push({ title: "Správa", items: [{ href: "/admin", label: "Uživatelé a škola", icon: "shield" }] });
  }

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <div className={styles.wrap}>
      <div className={styles.mobileBar}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>
            <Icon name="logo" size={20} />
          </span>
          <span className={styles.brandName}>ScioCamp</span>
        </Link>
        <button
          type="button"
          className={styles.menuButton}
          aria-expanded={open}
          aria-controls="hlavni-navigace"
          aria-label={open ? "Zavřít menu" : "Otevřít menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? "close" : "menu"} size={22} />
        </button>
      </div>

      <nav
        id="hlavni-navigace"
        aria-label="Hlavní navigace"
        className={styles.nav}
        data-open={open}
        // Na mobilu se menu po kliknutí na odkaz zavře.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        <Link href="/" className={`${styles.brand} ${styles.desktopBrand}`}>
          <span className={styles.brandMark}>
            <Icon name="logo" size={22} />
          </span>
          <span className={styles.brandName}>ScioCamp</span>
        </Link>

        {groups.map((g) => (
          <div key={g.title} className={styles.group}>
            <div className={styles.groupTitle}>{g.title}</div>
            {g.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={styles.item}
                aria-current={isActive(item.href) ? "page" : undefined}
              >
                <Icon name={item.icon} />
                {item.label}
                {!!item.badge && (
                  <span className={item.badgeTone === "accent" ? `${styles.badge} ${styles.badgeAccent}` : styles.badge}>
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
          </div>
        ))}

        <div className={styles.userCard} data-help="user-card">
          <Link href="/profil" className={styles.user} aria-current={isActive("/profil") ? "page" : undefined}>
            <span className={styles.avatar}>
              <MyPhoto initials={user.initials} />
            </span>
            <span className={styles.userText}>
              <span className={styles.userName}>{user.name}</span>
              <span className={styles.userRole}>{user.caption}</span>
            </span>
          </Link>
          <Link
            href="/napoveda"
            aria-label="Nápověda"
            title="Nápověda"
            className={styles.iconLink}
            aria-current={isActive("/napoveda") ? "page" : undefined}
          >
            <Icon name="help" size={18} />
          </Link>
          <Link
            href="/nastaveni"
            aria-label="Nastavení"
            className={styles.iconLink}
            aria-current={isActive("/nastaveni") ? "page" : undefined}
          >
            <Icon name="sliders" size={18} />
          </Link>
          <form action={logout}>
            <button type="submit" aria-label="Odhlásit se" title="Odhlásit se" className={styles.iconLink}>
              <Icon name="logout" size={18} />
            </button>
          </form>
        </div>
      </nav>
    </div>
  );
}
