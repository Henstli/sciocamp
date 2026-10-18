import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { getPhone } from "@/lib/data";
import { initials } from "@/lib/roles";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Nastavení" };

export default async function SettingsPage() {
  const user = await requireUser();
  const phone = await getPhone(user, user.id);
  return (
    <>
      <PageHeader title="Nastavení" subtitle="Tvůj profil a kontakt" avatar={{ initials: initials(user.name), name: user.name }} />
      <div style={{ maxWidth: 860 }}>
        <ProfileForm name={user.name} email={user.email} phone={phone ?? ""} bio={user.bio ?? ""} isStudent={user.role === "student"} />
      </div>
    </>
  );
}
