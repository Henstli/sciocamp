// Snímky pro Nápovědu. Projde každý návod v ukázkovém režimu aplikace
// (skutečné obrazovky a skutečný postup), u každého kroku vyfotí výřez před
// akcí, při psaní několik mezistavů a po kliknutí stav potom. Uloží je do
// public/napoveda/<návod>/ a souřadnice prvků do src/lib/help/shots.json.
//
// Spuštění (aplikace musí běžet v ukázkovém režimu, tj. bez proměnných Supabase):
//   npm run build && npm start         (v jiném okně, port 3000)
//   npm run napoveda:snimky            (všechny návody)
//   npm run napoveda:snimky -- meet    (jen jeden návod)
// Jiná adresa: NAPOVEDA_URL=http://localhost:3100 npm run napoveda:snimky
// Na Windows poprvé: npx playwright install chromium

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { chromium, type Locator, type Page } from "playwright";
import sharp from "sharp";
import { HELP_GUIDES, type HelpLocator, type HelpShot } from "../src/lib/help/guides.ts";

const BASE = process.env.NAPOVEDA_URL ?? "http://localhost:3000";
const OUT = "public/napoveda";
const MANIFEST = "src/lib/help/shots.json";
const VIEW = { width: 1280, height: 900 };
const SCALE = 2;
const only = process.argv[2];

type Box = { x: number; y: number; width: number; height: number };
export type ShotFrames = {
  w: number;
  h: number;
  /** 0 = před akcí, další = psaní nebo stav po kliknutí */
  frames: string[];
  /** Prvek v procentech výřezu */
  target: { x: number; y: number; w: number; h: number; r?: number } | null;
  action: "click" | "point" | "type" | "select" | "none";
  /** Psaní: text a vzhled obsahu pole, prohlížeč ho pak dopisuje po písmenech */
  typing?: HelpTyping;
};
type RawTyping = { text: string; box: Box; fontSize: number; lineHeight: number; fontWeight: string; color: string; background: string; multiline: boolean };
export type HelpTyping = {
  text: string;
  /** Obsah pole (bez okraje a odsazení) v podílech výřezu */
  box: { x: number; y: number; w: number; h: number };
  /** Písmo v podílech šířky výřezu */
  fontSize: number;
  lineHeight: number;
  fontWeight: string;
  color: string;
  background: string;
  multiline: boolean;
};

function find(scope: Page | Locator, l: HelpLocator): Locator {
  if ("role" in l) return scope.getByRole(l.role, { name: l.name, exact: l.exact });
  if ("label" in l) return scope.getByLabel(l.label, { exact: l.exact });
  if ("text" in l) return scope.getByText(l.text, { exact: l.exact });
  return scope.locator(l.css);
}

async function login(page: Page, name: string) {
  await page.goto(`${BASE}/prihlaseni`);
  // Animace nových odznaků by překážela.
  await page.evaluate(() => {
    localStorage.setItem("sciocamp-demo-odznaky", "1");
    localStorage.setItem("sciocamp-theme", "light");
  });
  await page.getByRole("button", { name: "Pokračovat přes Google" }).click();
  await page.getByRole("button", { name }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/prihlaseni"));
  await page.waitForLoadState("networkidle");
}

function clipFor(area: Box, target: Box | null, shot: HelpShot): Box {
  const pad = shot.pad ?? 16;
  const x = area.x - pad;
  let y = area.y - pad;
  const w = area.width + pad * 2;
  let h = area.height + pad * 2;
  const max = Math.min(shot.maxHeight ?? Infinity, VIEW.height);
  if (h > max) {
    // Okno kolem cílového prvku, ale uvnitř oblasti.
    const center = target ? target.y + target.height / 2 : y + max / 2;
    const top = Math.min(Math.max(center - max / 2, y), y + h - max);
    y = top;
    h = max;
  }
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(VIEW.width, Math.ceil(x + w));
  const bottom = Math.min(VIEW.height, Math.ceil(y + h));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Celá obrazovka (bez myši nad prvky); ořízne se až nakonec. */
async function grab(page: Page): Promise<Buffer> {
  // Poznámky o ukázkovém režimu do návodu nepatří (naostro tam nejsou).
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const re = /\s*\(?\s*(?:·\s*)?ukázkový režim[^)]*\)?\.?/gi;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeValue && /ukázkov/i.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(re, "");
    }
  });
  await page.mouse.move(2, VIEW.height - 2);
  await page.waitForTimeout(250);
  return page.screenshot({ animations: "disabled", caret: "hide" });
}

function union(a: Box, b: Box | null): Box {
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

async function shoot(page: Page, slug: string, index: number, shot: HelpShot): Promise<ShotFrames> {
  if (shot.goto) {
    await page.goto(`${BASE}${shot.goto}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
  }
  for (const p of shot.prepare ?? []) {
    if ("click" in p) await find(page, p.click).first().click();
    else if ("check" in p) await find(page, p.check).first().check();
    else await find(page, p.fill).first().fill(p.text);
  }
  const area = find(page, shot.area).first();
  await area.waitFor();
  const target = shot.target ? find(area, shot.target).first() : null;
  if (target) await target.scrollIntoViewIfNeeded();
  else await area.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  let areaBox = (await area.boundingBox())!;
  const tBox = target ? await target.boundingBox() : null;
  // Zaoblení prvku, ať zvýraznění sedí přesně na jeho okraji.
  const tRadius = target ? await target.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0) : 0;

  // Snímky celé obrazovky; výřez se spočítá z oblasti před i po akci (rozbalení).
  const shots = [await grab(page)];
  const action = shot.action ?? (target ? "point" : "none");
  let kind: ShotFrames["action"] = "none";
  let rawTyping: RawTyping | null = null;
  const grow = async () => {
    const box = await area.boundingBox().catch(() => null);
    areaBox = union(areaBox, box);
  };

  if (target && action === "click") {
    kind = "click";
    await target.click();
    if (shot.after) {
      await page.waitForTimeout(500);
      await grow();
      shots.push(await grab(page));
    }
  } else if (target && action === "point") {
    kind = "point";
  } else if (target && typeof action === "object" && "type" in action) {
    kind = "type";
    await target.click();
    if (action.clear) await target.fill("");
    // Napíše se celý text a vyfotí výsledek. Postupné psaní po písmenech
    // pak dělá přehrávač v prohlížeči nad tímto snímkem (stejné písmo a místo).
    await target.pressSequentially(action.type, { delay: 5 });
    rawTyping = await target.evaluate((el, text) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const px = (v: string) => parseFloat(v) || 0;
      const left = px(cs.borderLeftWidth) + px(cs.paddingLeft);
      const top = px(cs.borderTopWidth) + px(cs.paddingTop);
      const right = px(cs.borderRightWidth) + px(cs.paddingRight);
      const bottom = px(cs.borderBottomWidth) + px(cs.paddingBottom);
      const lh = cs.lineHeight === "normal" ? px(cs.fontSize) * 1.25 : px(cs.lineHeight);
      const multiline = el.tagName === "TEXTAREA";
      const height = multiline ? r.height - top - bottom : lh;
      return {
        text,
        box: { x: r.x + left, y: multiline ? r.y + top : r.y + (r.height - lh) / 2, width: r.width - left - right, height },
        fontSize: px(cs.fontSize),
        lineHeight: lh,
        fontWeight: cs.fontWeight,
        color: cs.color,
        background: cs.backgroundColor,
        multiline,
      };
    }, action.type);
    shots.push(await grab(page));
    await grow();
  } else if (target && typeof action === "object" && "select" in action) {
    kind = "select";
    await target.selectOption(action.select);
    await page.waitForTimeout(300);
    await grow();
    shots.push(await grab(page));
  }

  const clip = clipFor(areaBox, tBox, shot);
  const frames: string[] = [];
  for (const [n, png] of shots.entries()) {
    const file = `${slug}/${index + 1}-${n}.webp`;
    await sharp(png)
      .extract({ left: clip.x * SCALE, top: clip.y * SCALE, width: clip.width * SCALE, height: clip.height * SCALE })
      .webp({ quality: 86 })
      .toFile(`${OUT}/${file}`);
    frames.push(`/napoveda/${file}`);
  }
  const rel = tBox
    ? {
        x: (tBox.x - clip.x) / clip.width,
        y: (tBox.y - clip.y) / clip.height,
        w: tBox.width / clip.width,
        h: tBox.height / clip.height,
        r: tRadius / clip.width,
      }
    : null;
  const typing: HelpTyping | undefined = rawTyping
    ? {
        text: rawTyping.text,
        box: {
          x: (rawTyping.box.x - clip.x) / clip.width,
          y: (rawTyping.box.y - clip.y) / clip.height,
          w: rawTyping.box.width / clip.width,
          h: rawTyping.box.height / clip.height,
        },
        fontSize: rawTyping.fontSize / clip.width,
        lineHeight: rawTyping.lineHeight / clip.width,
        fontWeight: rawTyping.fontWeight,
        color: rawTyping.color,
        background: rawTyping.background,
        multiline: rawTyping.multiline,
      }
    : undefined;
  return { w: clip.width, h: clip.height, frames, target: rel, action: kind, ...(typing ? { typing } : {}) };
}

async function main() {
  const manifest: Record<string, (ShotFrames | null)[]> = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
  const browser = await chromium.launch();
  for (const guide of HELP_GUIDES) {
    if (only && guide.slug !== only) continue;
    console.log(`Návod: ${guide.title}`);
    const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE, locale: "cs-CZ", timezoneId: "Europe/Prague" });
    const page = await context.newPage();
    await login(page, guide.demoUser);
    // Staré snímky smazat až po úspěšném přihlášení (když aplikace neběží, zůstanou).
    rmSync(`${OUT}/${guide.slug}`, { recursive: true, force: true });
    mkdirSync(`${OUT}/${guide.slug}`, { recursive: true });
    const steps: (ShotFrames | null)[] = [];
    for (const [i, step] of guide.steps.entries()) {
      if (!step.shot) {
        steps.push(null);
        continue;
      }
      try {
        steps.push(await shoot(page, guide.slug, i, step.shot));
        console.log(`  ✓ ${i + 1}. ${step.title}`);
      } catch (e) {
        console.error(`  ✗ ${i + 1}. ${step.title}: ${(e as Error).message.split("\n")[0]}`);
        steps.push(null);
        process.exitCode = 1;
      }
    }
    manifest[guide.slug] = steps;
    await context.close();
  }
  await browser.close();
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + "\n");
  console.log(`Hotovo, souřadnice v ${MANIFEST}.`);
}

void main();
