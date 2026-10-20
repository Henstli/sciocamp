import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { ProfileView } from "@/components/ProfileView";
import { requireUser } from "@/lib/auth";
import { activitiesForUser, canOpenActivity, getPhone, getSocials, getUserById } from "@/lib/data";
import { shownBadges } from "@/lib/data-badges";
import { pragueNow, toIso } from "@/lib/time";

export async function generateMetadata({ params }: PageProps<"/lide/[id]">): Promise<Metadata> {
  const person = await getUserById((await params).id).catch(() => null);
  return { title: person?.name ?? "Profil" };
}

/** Profil jiného člověka ze školy (kliknutím na jeho avatar). */
export default async function PersonPage({ params }: PageProps<"/lide/[id]">) {
  const viewer = await requireUser();
  const { id } = await params;
  if (id === viewer.id) redirect("/profil");
  const person = await getUserById(id);
  if (!person) notFound();
  // Aktivity, které divák smí vidět (u studentů jen společné třídy — hlídá RLS u zápisů).
  const [activities, phone, socials, shown] = await Promise.all([
    activitiesForUser(person),
    getPhone(viewer, person.id),
    getSocials(person.id),
    person.role === "student" ? shownBadges(person.id) : Promise.resolve([]),
  ]);
  return (
    <>
      <BackButton />
      <ProfileView person={person} isMe={false} phone={phone} socials={socials} activities={activities}
        canOpen={activities.filter((a) => canOpenActivity(viewer, a)).map((a) => a.id)}
        todayIso={toIso(pragueNow())}
        shownBadges={shown}
      />
    </>
  );
}
