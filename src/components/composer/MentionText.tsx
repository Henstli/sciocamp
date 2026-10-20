// Text zprávy se zmínkami: „@[Jméno](id)“ se ukáže jako štítek s profilovkou.

import { Avatar, profileHref } from "../PageHeader";
import { parseMentions } from "@/lib/mentions";
import styles from "./composer.module.css";

export function MentionText({ body, meId, initialsOf }: { body: string; meId?: string; initialsOf?: (id: string) => string | undefined }) {
  const parts = parseMentions(body);
  if (parts.length === 1 && parts[0].kind === "text") return <>{body}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <span key={i}>{p.text}</span>
        ) : (
          <a key={i} href={profileHref(p.id)} className={styles.mention} data-me={p.id === meId} title={p.name}>
            <Avatar
              initials={initialsOf?.(p.id) ?? p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
              userId={p.id}
              size={18}
              tone="student"
            />
            {p.name}
          </a>
        ),
      )}
    </>
  );
}
