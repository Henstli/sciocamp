import Link from "next/link";
import { EmptyNote, PageHeader } from "@/components/PageHeader";

export default function NotFound() {
  return (
    <>
      <PageHeader title="Tahle stránka tu není" subtitle="Buď neexistuje, nebo k ní nemáš přístup." />
      <EmptyNote>
        <Link href="/">Zpět na Domov</Link>
      </EmptyNote>
    </>
  );
}
