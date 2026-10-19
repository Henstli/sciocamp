import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ActivityForm } from "@/components/manage/ActivityForm";
import { PageHeader } from "@/components/PageHeader";
import { requireTeacher } from "@/lib/auth";
import { listPeriods, listStaff, listTerms } from "@/lib/data";
import { currentPeriod } from "@/lib/periods";
import { pragueNow, toIso, todayIso } from "@/lib/time";
import { isAdmin } from "@/lib/roles";
import type { ActivityKind } from "@/lib/types";
import styles from "../ucitel.module.css";

export const metadata: Metadata = { title: "Nová aktivita" };

export default async function NewActivityPage({ searchParams }: PageProps<"/ucitel/nova">) {
  const user = await requireTeacher();
  const { typ } = await searchParams;
  const kind: ActivityKind = typ === "atelier" || typ === "ostatni" || typ === "expedice" ? typ : "kurz";
  const admin = isAdmin(user.role);
  const staff = (await listStaff()).map((s) => ({ id: s.id, name: s.name }));
  const periods = await listPeriods();
  const now = pragueNow();
  const current = currentPeriod(periods, toIso(now));

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
        periods={periods}
        terms={(await listTerms()).filter((t) => t.endsOn >= todayIso() || t.id === "")}
        canPickTeacher={admin}
        staff={staff}
        initial={{
          kind,
          title: "",
          description: "",
          location: "",
          periodId: current?.id ?? "",
          startsOn: "",
          endsOn: "",
          capacity: "",
          meetUrl: "",
          teacherId: user.id,
          grades: [],
          projectName: "",
          milestonesDone: 0,
          milestonesTotal: 5,
          slots: [],
          coTeacherIds: [],
          announceReady: false,
          termId: "",
          round: null,
        }}
      />
    </>
  );
}
