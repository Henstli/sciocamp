import type { Metadata } from "next";
import { ProfileView } from "@/components/ProfileView";
import { requireUser } from "@/lib/auth";
import { activitiesForUser, getPhone, getSocials } from "@/lib/data";
import { myBadgeProgress, shownBadges } from "@/lib/data-badges";
import { isSupabase } from "@/lib/config";
import { formatShortDate, pragueNow, toIso } from "@/lib/time";
import { wrapState } from "@/lib/data-wrap";
import { WrapBanner } from "@/components/wrap/WrapBanner";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [activities, phone, socials, progress, shown, wrap] = await Promise.all([
    activitiesForUser(user),
    getPhone(user, user.id),
    getSocials(user.id),
    myBadgeProgress(user),
    shownBadges(user.id),
    wrapState(user),
  ]);
  return (
    <ProfileView
      person={user} isMe phone={phone} socials={socials} activities={activities} todayIso={toIso(pragueNow())}
      shownBadges={shown} badgeProgress={progress} live={isSupabase}
      wrap={wrap?.active ? <WrapBanner until={formatShortDate(wrap.until)} season={wrap.season} trial={wrap.trial} /> : null}
    />
  );
}
