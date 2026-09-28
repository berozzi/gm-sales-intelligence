/**
 * Kształt danych pojedynczej oferty pracy.
 */

/** Trzy wymagane informacje + metadane techniczne. */
export interface JobOffer {
  /** Nazwa firmy (JAKEIJ firmy). */
  company: string | null;
  /** Nazwa stanowiska. */
  position: string | null;
  /** Zakres obowiązków - lista punktów z ogłoszenia. */
  responsibilities: string[];
  /** Zakres obowiązków jako jeden tekst (punkty połączone nową linią). */
  responsibilitiesText: string;

  // --- metadane techniczne (deduplikacja, wznawianie, debug) ---
  offerId: string | null;
  url: string;
  scrapedAt: string;

  // --- dodatkowy kontekst, który i tak jest widoczny na karcie oferty ---
  location: string | null;
  salary: string | null;
  employmentType: string | null;
}

/** Wynik wizyty na pojedynczej ofercie, wraz z ewentualnym błędem. */
export interface OfferResult {
  offer: JobOffer | null;
  error: string | null;
}

/** Oferta rozpoznana na stronie z listą (przed wejściem w szczegóły). */
export interface ListingEntry {
  offerId: string | null;
  url: string;
  title: string | null;
  company: string | null;
}

/** Kształt zapisywanej "bazy" - dużego JSON-a. */
export interface OffersDatabase {
  scrapedAt: string;
  source: string;
  count: number;
  offers: JobOffer[];
}
