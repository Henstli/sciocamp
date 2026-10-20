// Vzhled aplikace: světlý / tmavý / podle zařízení. Volba se ukládá do profilu
// (platí na všech zařízeních) a do localStorage, aby se tmavý režim zapnul hned
// při načtení stránky (skript v kořenovém layoutu), bez probliknutí.

export type ThemePref = "light" | "dark" | "system";

export const THEME_KEY = "sciocamp-theme";

export function isThemePref(v: unknown): v is ThemePref {
  return v === "light" || v === "dark" || v === "system";
}

/** Skript do <head>: nastaví data-theme dřív, než se stránka vykreslí. */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}")||"light";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;

/** Použije volbu hned (a zapamatuje si ji v prohlížeči). */
export function applyTheme(pref: ThemePref) {
  if (typeof document === "undefined") return;
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* soukromé okno apod. */
  }
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
