import { defineConfig, devices } from "@playwright/test";

/**
 * Wspólna definicja przeglądarki dla scrapera.
 *
 * Uwaga o Cloudflare: strony ofert (`www.pracuj.pl`) są za "managed
 * challenge". Wersje headless dostają 403 i utykają na stronie
 * "Cierpliwości...", nawet po wystawieniu ciasteczka `cf_clearance`.
 * Dlatego domyślnie scraper działa w trybie `headed`, z profilem
 * przeglądarki na dysku (przetrzymuje `cf_clearance` między uruchomieniami).
 */
export const BROWSER_CHANNEL = "chromium";

export const CONTEXT_OPTIONS = {
  locale: "pl-PL",
  timezoneId: "Europe/Warsaw",
  viewport: { width: 1440, height: 900 },
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  extraHTTPHeaders: {
    "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
  },
} as const;

export const LAUNCH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--no-default-browser-check",
] as const;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 180_000,
  expect: { timeout: 15_000 },

  use: {
    ...devices["Desktop Chrome"],
    ...CONTEXT_OPTIONS,
    headless: false,
    channel: BROWSER_CHANNEL,
    launchOptions: { args: [...LAUNCH_ARGS] },
  },
});
