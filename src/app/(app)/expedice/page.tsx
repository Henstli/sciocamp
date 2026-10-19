import type { Metadata } from "next";
import Link from "next/link";
import { MyActivities } from "@/components/MyActivities";
import { requireUser } from "@/lib/auth";
import { plural } from "@/lib/format";
import { canTeach } from "@/lib/roles";

export const metadata: Metadata = { title: "Expedice" };

export default async function ExpeditionsPage() {
  const user = await requireUser();
  const teacher = canTeach(user.role);
  return (
    <MyActivities
      user={user}
      kind="expedice"
      title="Expedice"
      subtitle={(n) => `${n} ${plural(n, "expedice", "expedice", "expedic")} · v týdnu expedic neprobíhá jiná výuka`}
      action={
        teacher ? (
          <Link href="/ucitel/nova?typ=expedice" className="btn btn-outline-primary">
            + Nová expedice
          </Link>
        ) : (
          <Link href="/zapisy?tab=expedice" className="btn btn-outline-primary">
            Zápis na expedici
          </Link>
        )
      }
      emptyText={teacher ? "Teď nevedeš žádnou expedici." : "Zatím nemáš žádnou expedici. Zapsat se můžeš v sekci Zápisy."}
      pastLabel="Proběhlé expedice"
    />
  );
}
