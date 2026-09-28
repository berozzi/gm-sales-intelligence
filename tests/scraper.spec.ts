import { expect, test } from "@playwright/test";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { runScrape } from "../src/scraper/run.ts";

/**
 * Test integracyjny: uruchamia cały przebieg na prawdziwej stronie
 * i sprawdza, że faktycznie dało się wyciągnąć trzy wymagane pola.
 *
 * Test jest "manualny" (nie wpięty w domyślny `npm test`), bo wymaga
 * uruchomienia przeglądarki w trybie headed i wejścia na prawdziwy serwis.
 *
 *   npx playwright test -g "scraper"
 */

test("scraper wyciąga firmę, stanowisko i zakres obowiązków", async () => {
  test.setTimeout(10 * 60_000);

  const summary = await runScrape({
    ...DEFAULT_CONFIG,
    limit: 3,
    maxPages: 1,
    outFile: "data/test-offers.json",
    // Zmniejszamy opóźnienia, żeby test nie trwał wiecznie.
    delayBetweenOffersMs: [500, 900],
  });

  expect(summary.offers.length).toBeGreaterThan(0);

  for (const offer of summary.offers) {
    // Trzy wymagane informacje.
    expect(offer.company, `brak firmy w ${offer.url}`).toBeTruthy();
    expect(offer.position, `brak stanowiska w ${offer.url}`).toBeTruthy();
    expect(offer.responsibilities.length, `brak obowiazkow w ${offer.url}`).toBeGreaterThan(0);
    expect(offer.offerId).toBeTruthy();
  }
});
