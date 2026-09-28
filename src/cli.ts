import { DEFAULT_CONFIG, type ScrapeConfig } from "./config.ts";
import { runScrape } from "./scraper/run.ts";
import { JsonFileStore, JsonFileStoreAppend } from "./storage/store.ts";
import { log } from "./utils/logger.ts";

/** Parsuje argumenty w formacie `--klucz wartość` / `--klucz=wartość` / `--bez-wartości`. */
function parseArgs(argv: string[]): { overrides: Partial<ScrapeConfig>; append: boolean; help: boolean } {
  const overrides: Record<string, unknown> = {};
  let append = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined || !arg.startsWith("--")) continue;

    const eq = arg.indexOf("=");
    const rawKey = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const inlineValue = eq === -1 ? undefined : arg.slice(eq + 1);
    const key = rawKey.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    const value = inlineValue ?? argv[i + 1];
    const consumesNext = inlineValue === undefined;

    if (key === "help") {
      help = true;
      continue;
    }
    if (key === "append") {
      append = true;
      continue;
    }

    switch (key) {
      case "headless":
      case "saveHtml":
        overrides[key] = value === "true" || value === "1";
        break;
      case "limit":
      case "maxPages":
      case "listingSettleMs":
      case "detailSettleMs": {
        const num = Number(value);
        if (Number.isFinite(num)) overrides[key] = num;
        break;
      }
      case "listingUrl":
      case "outFile":
      case "profileDir":
      case "debugDir":
        if (value) overrides[key] = value;
        break;
      default:
        log.warn(`Nieznana opcja: --${key}`);
        break;
    }

    if (consumesNext) i++;
  }

  return { overrides: overrides as Partial<ScrapeConfig>, append, help };
}

function printHelp(): void {
  log.raw(`
Scraper job boardu (Playwright + TypeScript)

Użycie:
  npm run scrape -- [opcje]

Opcje:
  --limit <n>            ile ofert zebrać              (domyślnie ${DEFAULT_CONFIG.limit})
  --max-pages <n>        ile stron listy przeszukać    (domyślnie ${DEFAULT_CONFIG.maxPages})
  --listing-url <url>    adres listy ofert             (domyślnie ${DEFAULT_CONFIG.listingUrl})
  --out-file <ścieżka>  plik JSON z bazą              (domyślnie ${DEFAULT_CONFIG.outFile})
  --append               dołącz do istniejącego pliku zamiast nadpisywać
  --save-html            zapisuj HTML ofert (diagnostyka)
  --headless <true|false>  tryb headless               (domyślnie false - wymagany przez Cloudflare)
  --help                 ta pomoc

Przykład:
  npm run scrape -- --limit 10 --out-file data/offers.json
`);
}

async function main(): Promise<void> {
  const { overrides, append, help } = parseArgs(process.argv.slice(2));
  if (help) {
    printHelp();
    return;
  }

  const config: ScrapeConfig = { ...DEFAULT_CONFIG, ...overrides };

  if (config.headless) {
    log.warn(
      "Tryb headless: Cloudflare blokuje strony ofert (www.pracuj.pl) i oferta nie zostanie wczytana.",
    );
  }

  const store = append ? new JsonFileStoreAppend(config.outFile) : new JsonFileStore(config.outFile);
  const summary = await runScrape(config, store);

  log.raw("");
  log.info(`Zebrano: ${summary.offers.length} ofert, błędów: ${summary.failed.length}`);
  if (summary.challengeHits > 0) log.info(`Weryfikacji Cloudflare: ${summary.challengeHits}`);
  for (const f of summary.failed) log.warn(`  ${f.url.slice(0, 80)} -> ${f.error}`);
  log.info(`Baza: ${summary.writtenTo}`);

  // Kod wyjścia != 0 tylko gdy nic nie udało się zebrać.
  if (summary.offers.length === 0) process.exitCode = 1;
}

await main();
