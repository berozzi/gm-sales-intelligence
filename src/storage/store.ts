import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { JobOffer, OffersDatabase } from "../types.ts";
import { log } from "../utils/logger.ts";

/**
 * Warstwa zapisu. Na razie "bazą" jest duży JSON na dysku - interfejs jest
 * celowo wąski, żeby później podmienić go na prawdziwą bazę (np. SQLite,
 * Postgres) bez ruszania logiki scrapowania.
 */
export interface OfferStore {
  save(offers: JobOffer[], meta: { source: string }): Promise<string>;
}

export class JsonFileStore implements OfferStore {
  protected readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async save(offers: JobOffer[], meta: { source: string }): Promise<string> {
    const target = resolve(this.filePath);
    const db: OffersDatabase = {
      scrapedAt: new Date().toISOString(),
      source: meta.source,
      count: offers.length,
      offers,
    };
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(db, null, 2)}\n`, "utf8");
    return target;
  }
}

/** Dociąga nowe oferty do istniejącego pliku, pomijając duplikaty po ID. */
export class JsonFileStoreAppend extends JsonFileStore {
  override async save(offers: JobOffer[], meta: { source: string }): Promise<string> {
    const target = resolve(this.filePath);
    const existing = await this.read(target);

    const byId = new Map<string, JobOffer>();
    for (const o of existing) if (o.offerId) byId.set(o.offerId, o);
    for (const o of offers) byId.set(o.offerId ?? `${o.url}-${offers.indexOf(o)}`, o);

    const merged = Array.from(byId.values());
    const db: OffersDatabase = {
      scrapedAt: new Date().toISOString(),
      source: meta.source,
      count: merged.length,
      offers: merged,
    };
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(db, null, 2)}\n`, "utf8");
    return target;
  }

  private async read(target: string): Promise<JobOffer[]> {
    try {
      const raw = await readFile(target, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && "offers" in parsed) {
        const list = (parsed as { offers: unknown }).offers;
        return Array.isArray(list) ? (list as JobOffer[]) : [];
      }
      return [];
    } catch {
      log.info("Nie znaleziono wcześniejszej bazy - zaczynam od zera");
      return [];
    }
  }
}
