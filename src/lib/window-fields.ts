// Termín zápisu z formuláře (pražský místní čas „rrrr-mm-ddThh:mm“ → ISO).
// Používá ho období (kurzy) i ateliér a expedice.

import { pragueLocalToIso } from "./time";

export function parseWindowFields(opensRaw: string, closesRaw: string, fieldErrors: Record<string, string>) {
  const opens = opensRaw ? pragueLocalToIso(opensRaw) : null;
  const closes = closesRaw ? pragueLocalToIso(closesRaw) : null;
  if (opensRaw && !opens) fieldErrors.enrollOpens = "Napiš datum jako 26. 10. 2026 a čas jako 18:00.";
  if (closesRaw && !closes) fieldErrors.enrollCloses = "Napiš datum jako 30. 10. 2026 a čas jako 20:00.";
  if (!fieldErrors.enrollOpens && !fieldErrors.enrollCloses) {
    if (!!opens !== !!closes) fieldErrors[opens ? "enrollCloses" : "enrollOpens"] = "Vyplň začátek i konec zápisu.";
    else if (opens && closes && closes <= opens) fieldErrors.enrollCloses = "Zápis musí skončit až po otevření.";
  }
  return { opens, closes };
}
