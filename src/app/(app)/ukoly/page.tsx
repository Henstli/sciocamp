import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Úkoly" };

export default function Page() {
  return <ComingSoon title="Úkoly" stage={2} what="Přehled všech úkolů napříč kurzy a ateliéry, odevzdávání souborů a Google dokumentů a hodnocení." />;
}
