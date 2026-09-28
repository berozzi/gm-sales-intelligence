import type { Page } from "playwright";
import type { ListingEntry } from "../types.ts";
import { extractOfferId, unique } from "../utils/text.ts";
import { log } from "../utils/logger.ts";

/**
 * Selektor karty oferty.
 *
 * Uwaga: atrybut `data-test` na karcie NIE jest stały - serwis używa
 * `default-offer` dla listy głównej, a `recommended-offer` (i inne) gdy
 * lecimy z kartą rekomendacji. Stabilny jest natomiast sam link
 * `link-offer` oraz `data-test-offerid` na kontenerze karty.
 */
const OFFER_LINK = 'a[data-test="link-offer"]';

/** Czyta listę ofert z załadowanej strony z wynikami. */
async function readEntries(page: Page): Promise<ListingEntry[]> {
  const rows = await page.$$eval(OFFER_LINK, (links) => {
    const clean = (s: string | null | undefined) =>
      (s ?? "").replace(/[\u00a0\u202f\u2007\u200b\u2060\ufeff]/g, " ").replace(/\s+/g, " ").trim();

    return links.map((a) => {
      const anchor = a as HTMLAnchorElement;
      // Karta to najbliższy przodek z data-test-offerid.
      const card = anchor.closest("[data-test-offerid]");
      const logo = card?.querySelector('[data-test="picture-company-logo"] img');
      const profile = card?.querySelector('[data-test="link-company-profile"]');

      return {
        url: anchor.href,
        offerId: card?.getAttribute("data-test-offerid") ?? null,
        title: clean(card?.querySelector('[data-test="offer-title"]')?.textContent) || null,
        company: clean(logo?.getAttribute("alt")) || clean(profile?.textContent) || null,
      };
    });
  });

  return rows;
}

/**
 * Zbiera adresy ofert z listy (ewentualnie z kilku stron).
 *
 * Strona potrafi zaserwować podzbiór rekomendowany zamiast pełnej listy,
 * dlatego po każdym wejściu sprawdzamy, czy udało się zebrać wystarczająco
 * dużo unikalnych ofert, i dopiero wtedy idziemy dalej.
 */
export async function collectListingEntries(
  page: Page,
  baseUrl: string,
  maxPages: number,
  limit: number,
): Promise<ListingEntry[]> {
  const collected = new Map<string, ListingEntry>();
  const seenUrls = new Set<string>();

  for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
    const url = pageNo === 1 ? baseUrl : `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}page=${pageNo}`;

    log.step(`Lista ofert - strona ${pageNo}/${maxPages}: ${url}`);
    const ok = await page.goto(url, { waitUntil: "domcontentloaded" }).then(() => true).catch(() => false);
    if (!ok) {
      log.warn(`Nie udało się wczytać strony ${pageNo}`);
      continue;
    }

    // Karty renderują się po stronie, więc czekamy na konkretny element.
    await page
      .waitForSelector(OFFER_LINK, { timeout: 30_000 })
      .catch(() => log.warn(`Brak kart ofert na stronie ${pageNo}`));
    await page.waitForTimeout(3_500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2)).catch(() => undefined);
    await page.waitForTimeout(1_200);

    const entries = await readEntries(page);
    let added = 0;
    for (const entry of entries) {
      const id = entry.offerId ?? extractOfferId(entry.url);
      const resolved: ListingEntry = { ...entry, offerId: id };
      if (!resolved.url || seenUrls.has(resolved.url)) continue;
      seenUrls.add(resolved.url);
      collected.set(id ?? resolved.url, resolved);
      added++;
    }

    log.ok(`Strona ${pageNo}: znaleziono ${entries.length} kart, dodano ${added} nowych (łącznie ${collected.size})`);
    if (collected.size >= limit) break;
  }

  return Array.from(collected.values());
}

/** Usuwa duplikaty po ID oferty (gdyby powtórzyła się ta sama reklama). */
export function dedupeEntries(entries: ListingEntry[]): ListingEntry[] {
  const seen = new Set<string>();
  const out: ListingEntry[] = [];
  for (const e of entries) {
    const key = e.offerId ?? e.url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  log.info(`Po deduplikacji: ${out.length} unikalnych ofert`);
  return unique(out);
}
