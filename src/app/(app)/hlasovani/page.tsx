import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Hlasování" };

export default function Page() {
  return <ComingSoon title="Hlasování" stage={4} what="Školní hlasování s termínem a průběžnými výsledky." />;
}
