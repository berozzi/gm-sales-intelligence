import { chromium } from "playwright";
import type { BrowserContext, Page } from "playwright";
import type { ScrapeConfig } from "./config.ts";
import { log } from "./utils/logger.ts";
import { sleepBetween, stripCloudflareToken } from "./utils/text.ts";

/** Ciasteczko, którego zdobycie oznacza przejście weryfikacji Cloudflare. */
const CLEARANCE_COOKIE = "cf_clearance";

/** Znaki charakterystyczne dla strony weryfikacyjnej Cloudflare. */
const CHALLENGE_MARKERS = [
  "Przeprowadzanie weryfikacji zabezpieczeń",
  "Ta witryna jest chroniona przed złośliwymi botami",
  "Verify you are human",
  "Just a moment",
  "Cierpliwości",
];

/**
 * Sesja przeglądarki oparta o Playwright.
 *
 * Trzyma `BrowserContext` z profilem na dysku, dzięki czemu ciasteczko
 * `cf_clearance` (ważne rok) przeżywa między uruchomieniami - nie trzeba
 * za każdym razem przechodzić weryfikacji od zera.
 */
export class BrowserSession {
  private readonly config: ScrapeConfig;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  /** Ile razy w bieżącym procesie rozpoznano challenge. */
  public challengeHits = 0;

  constructor(config: ScrapeConfig) {
    this.config = config;
  }

  /** Uruchamia przeglądarkę i otwiera pierwszą stronę. */
  async start(): Promise<void> {
    const { profileDir, headless, channel, userAgent, locale, timezoneId, viewport } = this.config;

    this.context = await chromium.launchPersistentContext(profileDir, {
      headless,
      ...(channel ? { channel } : {}),
      locale,
      timezoneId,
      userAgent,
      viewport,
      args: [
        // Ukrywa najbardziej rzucące się w oczy ślady automatyzacji.
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
      ],
    });

    this.context.setDefaultNavigationTimeout(this.config.navTimeoutMs);
    this.context.setDefaultTimeout(this.config.navTimeoutMs);

    const existing = this.context.pages();
    this.page = existing[0] ?? (await this.context.newPage());
    this.page.setDefaultTimeout(this.config.navTimeoutMs);

    log.info(
      `Przeglądarka uruchomiona (${headless ? "headless" : "headed"}, profil: ${profileDir})`,
    );
  }

  /** Zamyka przeglądarkę. */
  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    this.context = null;
    this.page = null;
  }

  getPage(): Page {
    if (!this.page) throw new Error("Sesja nie została uruchomiona - wywołaj start()");
    return this.page;
  }

  private getContext(): BrowserContext {
    if (!this.context) throw new Error("Sesja nie została uruchomiona - wywołaj start()");
    return this.context;
  }

  /**
   * Wchodzi na podany adres, radząc sobie z weryfikacją Cloudflare.
   *
   * `www.pracuj.pl` jest za Cloudflare'em z trybem "managed challenge".
   * Headless dostaje 403 i utknie na stronie "Cierpliwości...", mimo że
   * ciasteczko `cf_clearance` zostaje wystawione. Dlatego po wykryciu
   * challenge'u czekamy na to ciasteczko i wchodzimy ponownie.
   */
  async navigate(url: string, label = ""): Promise<boolean> {
    const clean = stripCloudflareToken(url);
    const tag = label ? ` (${label})` : "";

    for (let attempt = 1; attempt <= this.config.maxChallengeRetries; attempt++) {
      const response = await this.getPage()
        .goto(clean, { waitUntil: "domcontentloaded" })
        .catch((err: Error) => {
          log.warn(`Nawigacja nie powiodła się${tag}: ${err.message.split("\n")[0]}`);
          return null;
        });

      const status = response?.status() ?? 0;
      const challenged = await this.isChallenged(status);

      if (!challenged) {
        if (attempt > 1) log.ok(`Weryfikacja Cloudflare przejdzona${tag}`);
        return status > 0 && status < 400;
      }

      this.challengeHits++;
      log.warn(
        `Weryfikacja Cloudflare (status ${status})${tag} - próba ${attempt}/${this.config.maxChallengeRetries}`,
      );

      const cleared = await this.waitForClearance();
      if (!cleared) {
        log.warn(`Nie udało się uzyskać cf_clearance${tag}`);
        await sleepBetween([3_000, 5_000]);
        continue;
      }

      log.info(`Otrzymano cf_clearance${tag} - ponawiam wejście`);
      await this.getPage().waitForTimeout(1_500);
    }

    log.error(`Nie przeszło weryfikacji Cloudflare${tag}: ${clean}`);
    return false;
  }

  /** Czy bieżąca strona to strona weryfikacyjna Cloudflare? */
  private async isChallenged(status: number): Promise<boolean> {
    if (status === 403 || status === 503) return true;
    try {
      return await this.getPage()
        .evaluate(
          (markers: string[]) =>
            markers.some((m) => (document.body?.innerText ?? "").includes(m)) ||
            !!document.querySelector("#challenge-form, #cf-challenge-running, iframe[src*='challenges.cloudflare.com']"),
          CHALLENGE_MARKERS,
        )
        .catch(() => false);
    } catch {
      return false;
    }
  }

  /** Czeka aż w przeglądarce pojawi się ciasteczko `cf_clearance`. */
  private async waitForClearance(): Promise<boolean> {
    const deadline = Date.now() + this.config.challengeTimeoutMs;
    while (Date.now() < deadline) {
      const cookies = await this.getContext().cookies().catch(() => []);
      if (cookies.some((c) => c.name === CLEARANCE_COOKIE)) return true;
      await this.getPage().waitForTimeout(1_000);
    }
    return false;
  }

  /**
   * Zamyka nakładki, które mogą zasłaniać treść lub blokować klikanie:
   * pasek zgód cookies i popup ze zmianami w regulaminie.
   */
  async dismissOverlays(): Promise<void> {
    const page = this.getPage();
    const candidates = [
      '[data-test="button-submitCookie"]',
      '[data-test="modal-cookie-bottom-bar"] button',
      '[data-test="button-close-terms-of-service-popup"]',
    ];
    for (const selector of candidates) {
      const el = page.locator(selector).first();
      if ((await el.count()) === 0) continue;
      await el
        .click({ timeout: 3_000, force: true })
        .then(() => log.info(`Zamknięto nakładkę: ${selector}`))
        .catch(() => undefined);
    }
    // "OK, rozumiem" - popup o zmianach w regulaminie (tekst zależny od treści).
    const ack = page.getByRole("button", { name: /rozumiem|ok, zgadzam|akceptuję/i }).first();
    if ((await ack.count()) > 0) {
      await ack.click({ timeout: 3_000, force: true }).catch(() => undefined);
    }
  }

  /** Pauza między kolejnymi ofertami, żeby nie obciążać serwera. */
  async politeDelay(): Promise<void> {
    await sleepBetween(this.config.delayBetweenOffersMs);
  }
}
