"use client";

import { useLinkStatus } from "next/link";

/**
 * Ukazatel načítání uvnitř `<Link>`: hned po kliknutí se točí, než dorazí data.
 * Přes `[data-pending]` a CSS `:has()` se zároveň zvýrazní řádek a ztlumí panel.
 */
export function PendingHint({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={className} data-pending={pending || undefined} />;
}
