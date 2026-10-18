import { Suspense } from "react";
import { Sidebar } from "@/components/Sidebar";
import { PageSkeleton, SidebarSkeleton } from "@/components/Skeletons";
import { requireUser } from "@/lib/auth";
import { getHomeSummary } from "@/lib/data";
import { canTeach, initials, isAdmin, roleCaption } from "@/lib/roles";
import styles from "./shell.module.css";

// Kostra aplikace se vykreslí staticky hned. Vše, co čte session (navigace podle
// role i obsah stránek), se dotahuje za hranicemi <Suspense> — tak to Next 16
// s Cache Components vyžaduje.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <Suspense fallback={<SidebarSkeleton />}>
          <UserSidebar />
        </Suspense>
      </aside>
      <main className={styles.main}>
        <div className={styles.inner}>
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        </div>
      </main>
    </div>
  );
}

async function UserSidebar() {
  const user = await requireUser();
  const home = await getHomeSummary();
  const teach = canTeach(user.role);
  return (
    <Sidebar
      user={{ name: user.name, initials: initials(user.name), caption: roleCaption(user) }}
      showTeach={teach}
      showAdmin={isAdmin(user.role)}
      badges={{
        ukoly: home && user.role === "student" ? home.tasks.open : undefined,
        hlasovani: home?.polls.waiting,
        zpravy: home?.messages.unread,
        vyuka: home && teach ? home.toGrade : undefined,
      }}
    />
  );
}
