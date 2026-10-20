import { Suspense } from "react";
import { Sidebar } from "@/components/Sidebar";
import { PageSkeleton, SidebarSkeleton } from "@/components/Skeletons";
import { requireUser } from "@/lib/auth";
import { listUsers } from "@/lib/data";
import { wishesWaiting } from "@/lib/data-proposals";
import { AvatarState } from "@/components/AvatarState";
import { PresenceTracker } from "@/components/PresenceTracker";
import { LiveRefresh } from "@/components/LiveRefresh";
import { ThemeSync } from "@/components/ThemeSync";
import { BadgeCelebration } from "@/components/badges/BadgeCelebration";
import { WrapLauncher } from "@/components/wrap/WrapPlayer";
import { wrapState } from "@/lib/data-wrap";
import { isSupabase } from "@/lib/config";
import { MandatoryVote } from "@/components/proposals/MandatoryVote";
import { bannerSwatch } from "@/lib/banner";
import { homeTasks } from "@/lib/data-assignments";
import { unreadMessages } from "@/lib/data-communication";
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
          {/* Povinná hlasování o návrzích: okno, dokud člověk nehlasuje */}
          <Suspense fallback={null}>
            <MandatoryVote />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

async function UserSidebar() {
  const user = await requireUser();
  const [wishWaiting, tasks, messages, users, wrap] = await Promise.all([
    wishesWaiting(user),
    homeTasks(user),
    unreadMessages(user),
    listUsers(),
    wrapState(user),
  ]);
  // Kdo má profilovou fotku (cesta slouží i jako verze pro prohlížeč).
  const avatars = Object.fromEntries(
    users.filter((u) => u.avatarPath).map((u) => [u.id, u.avatarPath!]),
  );
  // Barva profilu (výchozí modrou nepředáváme) — obarví kolečka s iniciálami.
  const colors = Object.fromEntries(
    users.filter((u) => u.bannerColor && u.bannerColor !== "modra").map((u) => [u.id, bannerSwatch(u.bannerColor)]),
  );
  const teach = canTeach(user.role);
  return (
    <>
      <AvatarState map={avatars} colors={colors} meId={user.id} />
      <PresenceTracker userId={user.id} live={isSupabase} visible={user.showOnline !== false} />
      <LiveRefresh userId={user.id} live={isSupabase} />
      {isSupabase && <ThemeSync pref={user.theme ?? "light"} />}
      <BadgeCelebration live={isSupabase} />
      {/* Wrap „Tvůj rok v Campu“: po spuštění se jednou sám otevře */}
      <WrapLauncher autoOpen={!!wrap?.active && !wrap.seen} />
      <Sidebar
        user={{
          name: user.name,
          initials: initials(user.name),
          caption: roleCaption(user),
        }}
        showTeach={teach}
        showAdmin={isAdmin(user.role)}
        badges={{
          ukoly: tasks.headline || undefined,
          hlasovani: wishWaiting || undefined,
          zpravy: messages.unread || undefined,
          vyuka: undefined,
        }}
      />
    </>
  );
}
