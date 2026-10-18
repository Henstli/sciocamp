import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Návrhy" };

export default function Page() {
  return <ComingSoon title="Návrhy" stage={4} what="Návrhy studentů a učitelů na změny ve škole, s komentáři a podporou." />;
}
