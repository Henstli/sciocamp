import type { Metadata } from "next";
import { ProfileView } from "@/components/ProfileView";
import { ThemePicker } from "@/components/ThemePicker";
import { isSupabase } from "@/lib/config";
import { requireUser } from "@/lib/auth";
import { activitiesForUser, getPhone, getSocials } from "@/lib/data";
import { pragueNow, toIso } from "@/lib/time";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [activities, phone, socials] = await Promise.all([activitiesForUser(user), getPhone(user, user.id), getSocials(user.id)]);
  return (
    <ProfileView
      person={user} isMe phone={phone} socials={socials} activities={activities} todayIso={toIso(pragueNow())}
      appearance={<ThemePicker initial={user.theme ?? "light"} live={isSupabase} />}
    />
  );
}
