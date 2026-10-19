import type { Metadata } from "next";
import Link from "next/link";
import { MyActivities } from "@/components/MyActivities";
import { requireUser } from "@/lib/auth";
import { plural } from "@/lib/format";
import { canTeach } from "@/lib/roles";

export const metadata: Metadata = { title: "Události" };

export default async function EventsPage() {
  const user = await requireUser();
  return (
    <MyActivities
      user={user}
      kind="ostatni"
      title="Události"
      subtitle={(n) => `Třídnické konzultace, semináře a další akce · ${n} ${plural(n, "událost", "události", "událostí")}`}
      action={
        canTeach(user.role) ? (
          <Link href="/ucitel/nova?typ=ostatni" className="btn btn-outline-primary">
            + Nová událost
          </Link>
        ) : null
      }
      emptyText="Teď tu nejsou žádné události."
      pastLabel="Proběhlé události"
    />
  );
}
