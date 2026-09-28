import type { Page } from "playwright";
import type { JobOffer, OfferResult } from "../types.ts";
import { cleanText } from "../utils/text.ts";

/**
 * Surowe dane zebrane z wnętrza strony.
 *
 * Funkcja `page.evaluate` jest serializowana i wykonywana w przeglądarce,
 * dlatego nie może odwoływać się do niczego z zewnątrz - wszystko, czego
 * potrzebuje, dostaje przez argumenty.
 */
interface RawDetail {
  // --- kandydaci na stanowisko, w kolejności priorytetów ---
  ldTitle: string | null;
  h1: string | null;
  positionName: string | null;

  // --- kandydaci na firmę ---
  ldOrg: string | null;
  employerName: string | null;
  companyProfile: string | null;
  logoAlt: string | null;

  // --- zakres obowiązków ---
  responsibilityItems: string[];
  ldResponsibilities: string | null;
  responsibilityFallback: string | null;

  // --- kontekst dodatkowy ---
  ldEmploymentType: string | null;
  ldLocation: string | null;
  salary: string | null;

  jsonLdFound: boolean;
}

/** Wczytuje JSON-LD JobPosting, jeśli strona go zawiera. */
function readJsonLd(page: Page): Promise<Record<string, unknown> | null> {
  return page
    .evaluate(() => {
      const el = document.querySelector('[data-test="job-schema-org"]');
      if (!el) return null;
      try {
        const parsed: unknown = JSON.parse(el.textContent ?? "");
        return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    })
    .catch(() => null);
}

/** Pierwsza niepusta wartość z listy. */
function firstOf(...values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    const cleaned = cleanText(v);
    if (cleaned) return cleaned;
  }
  return null;
}

/**
 * `hiringOrganization` bywa w JSON-LD albo zwykłym tekstem, albo obiektem
 * schema.org z polem `name` - obsługujemy oba warianty.
 */
function readOrg(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "name" in value) {
    return String((value as { name: unknown }).name);
  }
  return null;
}

function readLocation(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "name" in value) {
    return String((value as { name: unknown }).name);
  }
  return null;
}

/** Zbiera wszystkie możliwe źródła danych ze strony oferty. */
async function readRaw(page: Page): Promise<RawDetail> {
  const dom = await page.evaluate(() => {
    const clean = (s: string | null | undefined) =>
      (s ?? "")
        .replace(/[\u00a0\u202f\u2007\u200b\u2060\ufeff]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    // 1. Punktory w sekcji "Twój zakres obowiązków".
    const respSection = document.querySelector('[data-test="section-responsibilities"]');
    const liItems = respSection
      ? Array.from(respSection.querySelectorAll("li")).map((li) => clean(li.textContent)).filter(Boolean)
      : [];

    // 2. Gdy nie ma <li>, sekcja może używać własnych komponentów
    //    (aggregate-bullet-model / aggregate-multi-paragraph-model).
    let bulletItems: string[] = [];
    if (liItems.length === 0 && respSection) {
      const nodes = respSection.querySelectorAll(
        '[data-test="aggregate-bullet-model"], [data-test="aggregate-multi-paragraph-model"]',
      );
      bulletItems = Array.from(nodes)
        .map((n) => clean(n.textContent))
        .filter(Boolean);
    }

    // 3. Ostateczny fallback: tekst sekcji bez nagłówka.
    let sectionText: string | null = null;
    if (liItems.length === 0 && bulletItems.length === 0 && respSection) {
      const clone = respSection.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll('[data-test="section-responsibilities-header"], h2, h3, h4')
        .forEach((n) => n.remove());
      const text = clean(clone.textContent);
      sectionText = text || null;
    }

    const logo = document.querySelector(
      '[data-test="picture-image-employer-logo"] img, [data-test="picture-company-logo"] img, [data-test="image-employer-logo"]',
    );

    return {
      h1: clean(document.querySelector("h1")?.textContent) || null,
      positionName: clean(document.querySelector('[data-test="text-positionName"]')?.textContent) || null,
      employerName: clean(document.querySelector('[data-test="text-employer-name"]')?.textContent) || null,
      companyProfile: clean(document.querySelector('[data-test="link-company-profile"]')?.textContent) || null,
      logoAlt: clean(logo?.getAttribute("alt")) || null,
      salary: clean(document.querySelector('[data-test="offer-salary"]')?.textContent) || null,
      responsibilityItems: liItems.length > 0 ? liItems : bulletItems,
      responsibilityFallback: sectionText,
    };
  });

  const jsonLd = await readJsonLd(page);

  return {
    ldTitle: jsonLd ? (jsonLd["title"] as string | null) ?? null : null,
    h1: dom.h1,
    positionName: dom.positionName,
    ldOrg: jsonLd ? readOrg(jsonLd["hiringOrganization"]) : null,
    employerName: dom.employerName,
    companyProfile: dom.companyProfile,
    logoAlt: dom.logoAlt,
    responsibilityItems: dom.responsibilityItems,
    ldResponsibilities: jsonLd ? (jsonLd["responsibilities"] as string | null) ?? null : null,
    responsibilityFallback: dom.responsibilityFallback,
    ldEmploymentType: jsonLd ? ((jsonLd["employmentType"] as string | null) ?? null) : null,
    ldLocation: jsonLd ? readLocation(jsonLd["jobLocation"]) : null,
    salary: dom.salary,
    jsonLdFound: jsonLd !== null,
  };
}

/**
 * Wybiera zakres obowiązków w kolejności:
 * 1. punktory z sekcji "Twój zakres obowiązków" (najlepsza jakość),
 * 2. pole `responsibilities` z JSON-LD,
 * 3. tekst sekcji bez nagłówka.
 */
function resolveResponsibilities(raw: RawDetail): string[] {
  const fromList = raw.responsibilityItems
    .map((item) => cleanText(item).replace(/[,\s]+$/, ""))
    .filter((item) => item.length > 1);

  if (fromList.length > 0) return fromList;

  const fromLd = cleanText(raw.ldResponsibilities);
  if (fromLd) return [fromLd];

  const fallback = cleanText(raw.responsibilityFallback);
  if (fallback) return [fallback];

  return [];
}

/** Składa rekord oferty z zebranych danych. */
function buildOffer(raw: RawDetail, url: string, offerId: string | null): JobOffer {
  const responsibilities = resolveResponsibilities(raw);

  return {
    company: firstOf(raw.ldOrg, raw.employerName, raw.companyProfile, raw.logoAlt),
    position: firstOf(raw.ldTitle, raw.h1, raw.positionName),
    responsibilities,
    responsibilitiesText: responsibilities.join("\n"),

    offerId,
    url,
    scrapedAt: new Date().toISOString(),

    location: firstOf(raw.ldLocation),
    salary: firstOf(raw.salary),
    employmentType: firstOf(raw.ldEmploymentType),
  };
}

/**
 * Wchodzi na stronę oferty i wyciąga firmę, stanowisko oraz zakres obowiązków.
 *
 * Zwraca `offer: null` zamiast rzucać wyjątkiem, żeby pojedyncza
 * nieudana oferta nie przerywała całego przebiegu.
 */
export async function scrapeOfferDetail(
  page: Page,
  url: string,
  offerId: string | null,
): Promise<OfferResult> {
  try {
    // Część ogłoszeń zwija długie treści - rozwijamy je przed odczytem.
    await page
      .locator('[data-test="show-more-button"]')
      .first()
      .click({ timeout: 2_500, force: true })
      .catch(() => undefined);
    await page.waitForTimeout(1_000);

    const raw = await readRaw(page);
    const offer = buildOffer(raw, url, offerId);

    const missing = [
      !offer.company && "firma",
      !offer.position && "stanowisko",
      offer.responsibilities.length === 0 && "zakres obowiązków",
    ].filter(Boolean);

    return {
      offer,
      error: missing.length > 0 ? `brak pól: ${missing.join(", ")}` : null,
    };
  } catch (err) {
    return { offer: null, error: (err as Error).message.split("\n")[0] ?? "nieznany błąd" };
  }
}

/** Zapisuje HTML strony - przydatne przy diagnozowaniu zmian na stronie. */
export async function saveDebugHtml(page: Page, filePath: string): Promise<void> {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, await page.content(), "utf8");
}
