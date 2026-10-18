import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Nastavení" };

export default function Page() {
  return <ComingSoon title="Nastavení" stage={3} what="Notifikace, synchronizace s Google Kalendářem a úprava profilu." />;
}
