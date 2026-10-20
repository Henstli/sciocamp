"use client";

// Spouštění wrapu: samo po spuštění (WrapLauncher v layoutu), z profilu
// a ze Správy (WrapButton). Data se načtou až při otevření.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { loadWrap, markWrapSeen } from "@/lib/actions/wrap";
import type { WrapData, WrapMode } from "@/lib/wrap";
import { WrapStory } from "./WrapStory";

function useWrapPlayer(markSeen: boolean) {
  const router = useRouter();
  const [data, setData] = useState<WrapData | null>(null);
  const [mode, setMode] = useState<WrapMode>("mine");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = (m: WrapMode) =>
    start(async () => {
      setError(null);
      const res = await loadWrap(m);
      if (res.data) {
        setMode(m);
        setData(res.data);
      } else setError(res.error ?? "Wrap se nepodařilo načíst.");
    });

  const close = () => {
    setData(null);
    if (mode === "mine" && markSeen) {
      void markWrapSeen().then(() => router.refresh());
    }
  };

  return { data, open, close, error, pending };
}

/** Samo otevře wrap, když je spuštěný a člověk ho letos ještě neviděl. */
export function WrapLauncher({ autoOpen }: { autoOpen: boolean }) {
  const { data, open, close } = useWrapPlayer(true);
  const tried = useRef(false);
  useEffect(() => {
    if (!autoOpen || tried.current) return;
    tried.current = true;
    open("mine");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jen jednou při načtení
  }, [autoOpen]);
  return data ? <WrapStory data={data} onClose={close} /> : null;
}

/** Tlačítko, které přehraje wrap (můj nebo ukázku). */
export function WrapButton({
  mode = "mine",
  markSeen = false,
  className = "btn btn-primary",
  children,
}: {
  mode?: WrapMode;
  /** Po zavření označit jako viděný (jen když je wrap spuštěný) */
  markSeen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { data, open, close, error, pending } = useWrapPlayer(markSeen);
  return (
    <>
      <button type="button" className={className} onClick={() => open(mode)} disabled={pending}>
        {pending ? "Načítám…" : children}
      </button>
      {error && (
        <span role="alert" style={{ color: "var(--late-fg)", fontSize: 13, fontWeight: 600 }}>
          {error}
        </span>
      )}
      {data && <WrapStory data={data} onClose={close} />}
    </>
  );
}
