/** Konfiguracja scrapera - wszystko w jednym miejscu, łatwe do nadpisania z CLI. */

export interface ScrapeConfig {
  /** Adres listy ofert. */
  listingUrl: string;
  /** Ile ofert docelowo zebrać. */
  limit: number;
  /** Ile stron listy przeszukać. */
  maxPages: number;

  /** Katalog profilu przeglądarki (przetrwanie ciasteczka Cloudflare). */
  profileDir: string;
  /**
   * UWAGA: `false` jest tu obowiązkowe.
   * Cloudflare blokuje wersje headless (nawet z cf_clearance), a tryb
   * "headed" + profil na dysku przechodzi weryfikację.
   */
  headless: boolean;
  /** Użyj pełnego Chromium zamiast headless-shell (mniej wykrywalny). */
  channel: "chromium" | undefined;

  userAgent: string;
  locale: string;
  timezoneId: string;
  viewport: { width: number; height: number };

  /** Timeout pojedynczego `goto`. */
  navTimeoutMs: number;
  /** Ile czekać na rozwiązanie challenge Cloudflare. */
  challengeTimeoutMs: number;
  /** Ile razy ponowić wejście po challenge'u. */
  maxChallengeRetries: number;
  /** Ile czekać na wyrenderowanie karty oferty na liście. */
  listingSettleMs: number;
  /** Ile czekać na wyrenderowanie treści szczegółów oferty. */
  detailSettleMs: number;

  /** Przerwa między kolejnymi ofertami (zakres losowy, żeby nie obciążać). */
  delayBetweenOffersMs: [number, number];

  /** Plik wyjściowy z bazą. */
  outFile: string;
  /** Zapisuj HTML podczas debugu. */
  saveHtml: boolean;
  /** Katalog na zrzuty HTML. */
  debugDir: string;
}

export const DEFAULT_CONFIG: ScrapeConfig = {
  listingUrl: "https://sprzedaz.pracuj.pl/praca",
  limit: 10,
  maxPages: 1,

  profileDir: ".browser-profile",
  headless: false,
  channel: "chromium",

  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  locale: "pl-PL",
  timezoneId: "Europe/Warsaw",
  viewport: { width: 1440, height: 900 },

  navTimeoutMs: 60_000,
  challengeTimeoutMs: 45_000,
  maxChallengeRetries: 3,
  listingSettleMs: 5_000,
  detailSettleMs: 2_500,

  delayBetweenOffersMs: [1_200, 2_600],

  outFile: "data/offers.json",
  saveHtml: false,
  debugDir: "data/debug",
};
