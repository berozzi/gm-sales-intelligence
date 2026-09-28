/** Pomocnicze operacje na tekście z HTML-a. */

/** Znaki niełamliwe, którymi Polacy zapisują spacje (np. "6 500 zł"). */
const INVISIBLE = /[\u00a0\u202f\u2007\u200b\u2060\ufeff]/g;

/** Usuwa niewidoczne znaki, normalizuje odstępy, obcina. */
export function cleanText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(INVISIBLE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Usuwa niewidoczne znaki i normalizuje odstępy, ale zachowuje znaki nowej linii. */
export function cleanMultiline(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(INVISIBLE, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Wycina ID oferty z adresu w formacie `...,oferta,1005122050`. */
export function extractOfferId(url: string): string | null {
  const m = /,oferta,(\d+)/.exec(url);
  return m?.[1] ?? null;
}

/**
 * Usuwa z URL parametr `__cf_chl_rt_tk`, który dokleja Cloudflare
 * do adresu podczas weryfikacji. Po jego usunięciu można wejść ponownie.
 */
export function stripCloudflareToken(url: string): string {
  const u = new URL(url);
  u.searchParams.delete("__cf_chl_rt_tk");
  u.searchParams.delete("__cf_chl_rt_ck");
  return u.toString();
}

/** Losowa przerwa z zakresu, żeby nie obciążać serwera regularnym rytmem. */
export function sleepBetween(range: [number, number]): Promise<void> {
  const [min, max] = range;
  const ms = min + Math.random() * Math.max(0, max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Usuwa duplikaty, zachowując kolejność. */
export function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
