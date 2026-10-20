import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { WishBoard, type WishView } from "@/components/proposals/WishBoard";
import { WishForm } from "@/components/proposals/WishForm";
import { requireUser } from "@/lib/auth";
import { getUsersByIds, listActivities } from "@/lib/data";
import { listWishes, purgeExpiredWishes } from "@/lib/data-proposals";
import { plural } from "@/lib/format";
import { activityHref } from "@/lib/links";
import { WISH_DAYS, wishDaysLeft } from "@/lib/proposals";
import { canTeach, initials } from "@/lib/roles";
import { formatStamp, nowMs } from "@/lib/time";
import styles from "../navrhy/navrhy.module.css";

export const metadata: Metadata = { title: "Hlasování" };

export default async function WishesPage() {
  const user = await requireUser();
  await purgeExpiredWishes();
  const [wishes, all] = await Promise.all([listWishes(user), listActivities()]);
  const people = await getUsersByIds([...new Set(wishes.map((w) => w.authorId))]);
  const now = new Date(nowMs());
  const staff = canTeach(user.role);

  const views: WishView[] = wishes.map((w) => {
    const a = w.activityId ? all.find((x) => x.dbId === w.activityId || x.id === w.activityId) : undefined;
    return {
      ...w,
      authorName: people.find((u) => u.id === w.authorId)?.name ?? "Bývalý člen školy",
      when: formatStamp(w.createdAt, now),
      activity: a ? { href: activityHref(a), title: a.title } : null,
      mine: w.authorId === user.id,
      daysLeft: w.status === "vypsano" ? null : wishDaysLeft(w.createdAt, now.getTime()),
    };
  });


  const waiting = wishes.filter((w) => w.status === "open" && !w.voted).length;
  return (
    <>
      <PageHeader
        title="Hlasování"
        subtitle={
          waiting > 0
            ? `${waiting} ${plural(waiting, "přání čeká", "přání čekají", "přání čeká")} na tvůj hlas — šipkou nahoru dej vědět, co by tě bavilo.`
            : `Jaké ateliéry, expedice a kurzy by tě bavily? Přání sbírá hlasy ${WISH_DAYS} dní.`
        }
        avatar={{ initials: initials(user.name), name: user.name }}
      >
        <a href="#formular" className={`btn btn-primary ${styles.mobileOnly}`}>
          <Icon name="plus" size={16} strokeWidth={2.8} />
          Přidat přání
        </a>
      </PageHeader>
      <div className={styles.layout}>
        <div className={styles.side} id="formular">
          <WishForm />
        </div>
        <WishBoard wishes={views} staff={staff} />
      </div>
    </>
  );
}
