/** České skloňování podle počtu: 1 kurz, 2 kurzy, 5 kurzů. */
export function plural(n: number, one: string, few: string, many: string): string {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}

/** „1,2 MB“ */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["kB", "MB", "GB"];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toLocaleString("cs-CZ", { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[u]}`;
}
