/** Publiczne API scrapera - do użycia jako biblioteka. */

export { DEFAULT_CONFIG, type ScrapeConfig } from "./config.ts";
export { BrowserSession } from "./browser.ts";
export { runScrape, type ScrapeSummary } from "./scraper/run.ts";
export { collectListingEntries, dedupeEntries } from "./scraper/listing.ts";
export { scrapeOfferDetail, saveDebugHtml } from "./scraper/detail.ts";
export { JsonFileStore, JsonFileStoreAppend, type OfferStore } from "./storage/store.ts";
export type { JobOffer, ListingEntry, OfferResult, OffersDatabase } from "./types.ts";
