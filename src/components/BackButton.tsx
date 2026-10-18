"use client";

import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

/** „Zpět“ na předchozí stránku (odkud uživatel přišel). */
export function BackButton({ label = "Zpět" }: { label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      style={{
        alignSelf: "flex-start",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: 40,
        padding: 0,
        border: 0,
        background: "transparent",
        font: "inherit",
        fontSize: 14,
        fontWeight: 700,
        color: "var(--primary-text)",
        cursor: "pointer",
      }}
    >
      <Icon name="chevronLeft" size={16} strokeWidth={2.2} />
      {label}
    </button>
  );
}
