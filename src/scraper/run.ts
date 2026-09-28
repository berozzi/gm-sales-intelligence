import { DEFAULT_CONFIG, type ScrapeConfig } from "../config.ts";
import type { JobOffer, ListingEntry, OfferResult } from "../types.ts";
import { BrowserSession } from "../browser.ts";
import { collectListingEntries, dedupeEntries } from "./listing.ts";
import { scrapeOfferDetail, saveDebugHtml } from "./detail.ts";
import { JsonFileStore, type OfferStore } from "../storage/store.ts";
import { log } from "../utils/logger.ts";

export interface ScrapeSummary {
  offers: JobOffer[];
  failed: { url: string; error: string }[];
  writtenTo: string;
  challengeHits: number;
}

/**
 * Główny przebieg: lista -> wejście w każdą ofertę -> zapis do bazy.
 */
export async function runScrape(
  overrides: Partial<ScrapeConfig> = {},
  store: OfferStore | null = null,
): Promise<ScrapeSummary> {
  const config: ScrapeConfig = { ...DEFAULT_CONFIG, ...overrides };
  const session = new BrowserSession(config);
  const failed: { url: string; error: string }[] = [];
  const offers: JobOffer[] = [];

  const startedAt = Date.now();
  log.step(`Start scrapowania: ${config.listingUrl} (limit: ${config.limit})`);

  try {
    await session.start();
    const page = session.getPage();

    // --- 1. Lista ofert -------------------------------------------------
    const listingUrl = await session.navigate(config.listingUrl, "lista");
    if (!listingUrl) throw new Error("Nie udało się wczytać strony z listą ofert");

    await session.dismissOverlays();
    const entries: ListingEntry[] = dedupeEntries(
      await collectListingEntries(page, config.listingUrl, config.maxPages, config.limit),
    );

    if (entries.length === 0) throw new Error("Na liście nie znaleziono żadnej oferty");

    // Ograniczamy do zadanej liczby ofert.
    const todo = entries.slice(0, config.limit);
    log.step(`Do przetworzenia: ${todo.length} ofert`);

    // --- 2. Wejście w każdą ofertę -------------------------------------
    for (const [index, entry] of todo.entries()) {
      const no = index + 1;
      const label = `${no}/${todo.length} oferta ${entry.offerId ?? ""}`.trim();

      const entered = await session.navigate(entry.url, label);
      if (!entered) {
        failed.push({ url: entry.url, error: "nie udało się wejść w ofertę" });
        log.error(`${label} - wejście nieudane`);
        await session.politeDelay();
        continue;
      }

      await page.waitForTimeout(config.detailSettleMs);
      await session.dismissOverlays();
      if (config.saveHtml) {
        await saveDebugHtml(page, `${config.debugDir}/offer-${entry.offerId ?? no}.html`).catch(() => undefined);
      }

      const result: OfferResult = await scrapeOfferDetail(page, entry.url, entry.offerId);
      if (!result.offer) {
        failed.push({ url: entry.url, error: result.error ?? "brak danych" });
        log.error(`${label} - ${result.error ?? "brak danych"}`);
      } else {
        offers.push(result.offer);
        const warn = result.error ? ` (${result.error})` : "";
        log.ok(
          `${label} -> firma: "${result.offer.company ?? "?"}" | stanowisko: "${(result.offer.position ?? "?").slice(0, 45)}" | obowiązki: ${result.offer.responsibilities.length} pkt${warn}`,
        );
      }

      await session.politeDelay();
    }

    // --- 3. Zapis do lokalnej bazy --------------------------------------
    const target = store ?? new JsonFileStore(config.outFile);
    const writtenTo = await target.save(offers, { source: config.listingUrl });
    log.ok(`Zapisano ${offers.length} ofert do ${writtenTo}`);

    return { offers, failed, writtenTo, challengeHits: session.challengeHits };
  } finally {
    await session.close();
    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    log.info(`Czas wykonania: ${secs}s`);
  }
}
