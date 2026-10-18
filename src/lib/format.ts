/** České skloňování podle počtu: 1 kurz, 2 kurzy, 5 kurzů. */
export function plural(n: number, one: string, few: string, many: string): string {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}
