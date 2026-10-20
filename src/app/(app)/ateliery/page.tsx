import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { MyActivities } from "@/components/MyActivities";
import { requireUser } from "@/lib/auth";
import { plural } from "@/lib/format";
import { canTeach } from "@/lib/roles";

export const metadata: Metadata = { title: "Ateliéry" };

export default async function AteliersPage() {
  const user = await requireUser();
  const teacher = canTeach(user.role);
  return (
    <MyActivities
      user={user}
      kind="atelier"
      title="Ateliéry"
      subtitle={(n) =>
        `${n} ${plural(n, "ateliér", "ateliéry", "ateliérů")}, ${teacher ? "které vedeš nebo navštěvuješ" : "do kterých chodíš"} · během období se střídají`
      }
      action={
        teacher ? (
          <Link href="/ucitel/nova?typ=atelier" className="btn btn-outline-primary">
            <Icon name="plus" size={16} strokeWidth={2.8} />
            Nový ateliér
          </Link>
        ) : (
          <Link href="/zapisy?tab=ateliery" className="btn btn-outline-primary">
            Zápis na další ateliér
          </Link>
        )
      }
      emptyText={teacher ? "Teď nevedeš žádný ateliér." : "Teď nemáš žádný ateliér. Zapsat se můžeš v sekci Zápisy."}
      pastLabel="Proběhlé ateliéry"
    />
  );
}
