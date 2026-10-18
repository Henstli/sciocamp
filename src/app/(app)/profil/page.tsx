import type { Metadata } from "next";
import { ProfileView } from "@/components/ProfileView";
import { requireUser } from "@/lib/auth";
import { activitiesForUser, getPhone } from "@/lib/data";
import { pragueNow, toIso } from "@/lib/time";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [activities, phone] = await Promise.all([activitiesForUser(user), getPhone(user, user.id)]);
  return <ProfileView person={user} isMe phone={phone} activities={activities} todayIso={toIso(pragueNow())} />;
}
