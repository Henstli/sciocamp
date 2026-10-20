// Karta roku jako obrázek (1080 × 1350, poměr 4:5 pro Instagram).
// Kreslí se v prohlížeči na <canvas>, bez knihoven.

import type { WrapCard } from "./wrap";

const W = 1080;
const H = 1350;
const FONT = '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", system-ui, sans-serif';
const LOGO = "M3 20 12 4l9 16zM9.5 20 12 15.5 14.5 20";

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s,.]+\S*$/, "")}…`;
    return kept;
  }
  return lines;
}

function icon(ctx: CanvasRenderingContext2D, path: string, x: number, y: number, size: number, color: string, width = 1.8) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D(path));
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Nakreslí kartu a vrátí PNG. */
export async function renderWrapCard(card: WrapCard): Promise<Blob> {
  try {
    await Promise.all([
      document.fonts.load(`800 120px ${FONT}`),
      document.fonts.load(`700 40px ${FONT}`),
    ]);
  } catch {
    // bez písma se použije systémové
  }
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const [c0, c1, c2] = card.type.card;

  // Pozadí s přechodem a světly
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, c0);
  g.addColorStop(0.45, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.arc(W - 60, 40, 380, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(40, H - 60, 300, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "alphabetic";

  // Hlavička
  icon(ctx, LOGO, 80, 74, 44, "#FFFFFF", 2.2);
  ctx.font = `800 34px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText("ScioCamp", 140, 110);
  ctx.textAlign = "right";
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText(card.season, W - 80, 110);

  // Dlaždice s ikonou typu
  const tile = 250;
  const tx = (W - tile) / 2;
  const ty = 190;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, tx, ty, tile, tile, 76);
  ctx.fill();
  ctx.restore();
  icon(ctx, card.type.icon, tx + tile * 0.22, ty + tile * 0.22, tile * 0.56, card.type.color, 1.8);

  // Kdo a jaký typ
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText(`${card.firstName} je`, W / 2, 545);
  ctx.fillStyle = "#FFFFFF";
  let size = 124;
  ctx.font = `800 ${size}px ${FONT}`;
  while (ctx.measureText(card.type.name).width > W - 140 && size > 60) {
    size -= 4;
    ctx.font = `800 ${size}px ${FONT}`;
  }
  ctx.fillText(card.type.name, W / 2, 670);
  ctx.font = `600 40px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  wrapText(ctx, card.type.short, 820, 2).forEach((l, i) => ctx.fillText(l, W / 2, 750 + i * 56));

  // Tři čísla
  const gap = 24;
  const top = 900;
  const boxW = (W - 160 - gap * 2) / 3;
  const boxH = 210;
  card.stats.forEach((s, i) => {
    const x = 80 + i * (boxW + gap);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    roundRect(ctx, x, top, boxW, boxH, 36);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    let vs = 76;
    ctx.font = `800 ${vs}px ${FONT}`;
    while (ctx.measureText(s.value).width > boxW - 30 && vs > 40) {
      vs -= 4;
      ctx.font = `800 ${vs}px ${FONT}`;
    }
    ctx.fillText(s.value, x + boxW / 2, top + 100);
    ctx.font = `700 28px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    wrapText(ctx, s.label, boxW - 30, 2).forEach((l, j) => ctx.fillText(l, x + boxW / 2, top + 148 + j * 34));
  });

  // Patička se jménem
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 1170);
  ctx.lineTo(W - 80, 1170);
  ctx.stroke();
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(128, 1250, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = card.type.color;
  ctx.font = `800 34px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(card.initials, 128, 1252);
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(card.fullName, 200, 1252);
  ctx.textAlign = "right";
  ctx.font = `600 30px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText("Tvůj rok v Campu", W - 80, 1252);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas"))), "image/png"));
}

/** Uloží kartu: na telefonu přes sdílení (Uložit obrázek), jinak stažením. */
export async function saveWrapCard(card: WrapCard): Promise<"shared" | "downloaded"> {
  const blob = await renderWrapCard(card);
  const name = `sciocamp-${card.season.replace("/", "-")}-${card.type.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-")}.png`;
  const file = new File([blob], name, { type: "image/png" });
  const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Můj rok v Campu" });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "shared";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}
