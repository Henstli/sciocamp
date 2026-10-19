import type { Metadata } from "next";
import Link from "next/link";
import { MyActivities } from "@/components/MyActivities";
import { requireUser } from "@/lib/auth";
import { plural } from "@/lib/format";
import { canTeach } from "@/lib/roles";

export const metadata: Metadata = { title: "Kurzy" };

export default async function CoursesPage() {
  const user = await requireUser();
  const teacher = canTeach(user.role);
  return (
    <MyActivities
      user={user}
      kind="kurz"
      title="Kurzy"
      subtitle={(n) => `${n} ${plural(n, "kurz", "kurzy", "kurzů")}, ${teacher ? "které učíš nebo do kterých chodíš" : "do kterých chodíš"}`}
      action={
        <Link href="/zapisy" className="btn btn-outline-primary">
          Celá nabídka a zápis
        </Link>
      }
      emptyText={teacher ? "Teď neučíš žádný kurz." : "Zatím nemáš žádné kurzy. Zapsat se můžeš v sekci Zápisy."}
      pastLabel="Proběhlé kurzy"
    />
  );
}
