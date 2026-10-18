import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ActivityForm } from "@/components/manage/ActivityForm";
import { PageHeader } from "@/components/PageHeader";
import { requireTeacher } from "@/lib/auth";
import { listStaff } from "@/lib/data";
import { isAdmin } from "@/lib/roles";
import type { ActivityKind } from "@/lib/types";
import styles from "../ucitel.module.css";

export const metadata: Metadata = { title: "Nová aktivita" };

export default async function NewActivityPage({ searchParams }: PageProps<"/ucitel/nova">) {
  const user = await requireTeacher();
  const { typ } = await searchParams;
  const kind: ActivityKind = typ === "atelier" || typ === "ostatni" ? typ : "kurz";
  const admin = isAdmin(user.role);
  const staff = admin ? (await listStaff()).map((s) => ({ id: s.id, name: s.name })) : [];

  return (
    <>
      <Link href={admin ? "/admin?tab=kurzy" : "/ucitel"} className={styles.back}>
        <Icon name="chevronLeft" size={16} strokeWidth={2.2} />
        {admin ? "Správa" : "Moje třídy"}
      </Link>
      <PageHeader
        title="Nová aktivita"
        subtitle={admin ? "Kurz, ateliér nebo jiná aktivita. Vyber, kdo ji vede." : "Kurz, ateliér nebo jiná aktivita, kterou povedeš ty."}
      />
      <ActivityForm
        canPickTeacher={admin}
        staff={staff}
        initial={{
          kind,
          title: "",
          description: "",
          room: "",
          capacity: "",
          meetUrl: "",
          teacherId: user.id,
          grades: [],
          projectName: "",
          milestonesDone: 0,
          milestonesTotal: 5,
          slots: [],
        }}
      />
    </>
  );
}
