import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";
import { getHomeSummary } from "@/lib/data";
import { canTeach, initials, isAdmin, roleCaption } from "@/lib/roles";
import styles from "./shell.module.css";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const home = await getHomeSummary();
  const teach = canTeach(user.role);

  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <Sidebar
          user={{ name: user.name, initials: initials(user.name), caption: roleCaption(user) }}
          showTeach={teach}
          showAdmin={isAdmin(user.role)}
          badges={{
            ukoly: user.role === "student" ? home.tasks.open : undefined,
            hlasovani: home.polls.waiting,
            zpravy: home.messages.unread,
            vyuka: teach ? home.toGrade : undefined,
          }}
        />
      </aside>
      <main className={styles.main}>
        <div className={styles.inner}>{children}</div>
      </main>
    </div>
  );
}
