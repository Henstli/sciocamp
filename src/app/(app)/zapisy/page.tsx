import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Zápisy" };

export default function Page() {
  return <ComingSoon title="Zápisy" stage={4} what="Zápis do kurzů a ateliérů na další blok, kapacity a pořadí přání." />;
}
