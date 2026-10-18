import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Zprávy" };

export default function Page() {
  return <ComingSoon title="Zprávy" stage={3} what="Soukromé zprávy, chaty tříd a týmů a notifikace." />;
}
