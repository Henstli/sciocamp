import { Icon } from "./Icon";

/** Odkaz na Google Meet hodiny. Otevírá se v nové kartě. */
export function MeetLink({
  url,
  variant = "soft",
  label = "Meet",
  className = "",
  title,
}: {
  url: string | null;
  variant?: "primary" | "soft" | "white";
  label?: string;
  className?: string;
  title?: string;
}) {
  const cls = variant === "primary" ? "btn btn-primary" : variant === "white" ? "btn btn-white" : "btn btn-soft";
  if (!url) {
    // Odkaz zatím nikdo nevložil — tlačítko zůstane na místě, ať se rozvržení nemění.
    return (
      <span className={`${cls} ${className}`} aria-disabled="true" title="Vyučující zatím nevložil odkaz na Meet">
        <Icon name="video" size={18} />
        Meet zatím není
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${cls} ${className}`}
      aria-label={title ?? `${label} (Google Meet, otevře se v nové kartě)`}
    >
      <Icon name="video" size={18} />
      {label}
    </a>
  );
}
