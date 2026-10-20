import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { getPhone, getSocials } from "@/lib/data";
import { initials } from "@/lib/roles";
import { AvatarUpload } from "./AvatarUpload";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Nastavení" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [phone, socials] = await Promise.all([getPhone(user, user.id), getSocials(user.id)]);
  return (
    <>
      <PageHeader title="Nastavení" subtitle="Tvůj profil a kontakt" avatar={{ initials: initials(user.name), name: user.name }} />
      <div style={{ maxWidth: 860, display: "grid", gap: 16 }}>
        <AvatarUpload userId={user.id} initials={initials(user.name)} hasPhoto={!!user.avatarPath} />
        <ProfileForm name={user.name} email={user.email} phone={phone ?? ""} bio={user.bio ?? ""} isStudent={user.role === "student"}
          instagram={socials?.instagram ?? ""}
        />
      </div>
    </>
  );
}
