# Scraper job boardów (Playwright + TypeScript)

Scraper ofert pracy, który dla każdej oferty zbiera **trzy informacje**:

1. **firma** – nazwa pracodawcy,
2. **stanowisko** – nazwa stanowiska,
3. **zakres obowiązków** – lista punktów z ogłoszenia.

Wynik trafia do lokalnej bazy w postaci dużego pliku JSON.

Domyślnym źródłem jest kategoria sprzedaży: <https://sprzedaz.pracuj.pl/praca>

---

## Szybki start

```bash
npm install
npx playwright install chromium   # przeglądarka (raz)

npm run scrape -- --limit 10
```

Wynik: `data/offers.json`

> **Uwaga:** przy pierwszym uruchomieniu pojawi się okno przeglądarki.
> To celowe – patrz sekcja *Cloudflare* poniżej. Zamknij je dopiero po
> zakończeniu pracy scrapera.

## Uruchomienie

```bash
npm run scrape                      # domyślnie 10 ofert -> data/offers.json
npm run scrape -- --help            # wszystkie opcje
npm run scrape -- --limit 50 --max-pages 2
npm run scrape -- --append          # dołącz do istniejącego pliku
npm run typecheck                   # sprawdzenie typów
```

| Opcja | Domyślnie | Opis |
| --- | --- | --- |
| `--limit <n>` | `10` | ile ofert zebrać |
| `--max-pages <n>` | `1` | ile stron listy przeszukać |
| `--listing-url <url>` | `https://sprzedaz.pracuj.pl/praca` | inna lista/kategoria |
| `--out-file <ścieżka>` | `data/offers.json` | plik z bazą |
| `--append` | – | dołącz zamiast nadpisywać |
| `--save-html` | `false` | zrzuty HTML (diagnostyka) |
| `--headless <bool>` | `false` | patrz *Cloudflare* |

## Format bazy

```jsonc
{
  "scrapedAt": "2026-09-28T13:07:12.269Z",
  "source": "https://sprzedaz.pracuj.pl/praca",
  "count": 1,
  "offers": [
    {
      "company": "MODIVO PLATFORM",              // ← firma
      "position": "Sprzedawca (k/m) CCC",        // ← stanowisko
      "responsibilities": [                      // ← zakres obowiązków
        "Wsparcie i realizacja procesów sklepowych, ...",
        "Praca z produktami marek własnych ...",
        "Dbanie o ekspozycję i estetykę produktów."
      ],
      "responsibilitiesText": "Wsparcie i realizacja ...\nPraca z produktami ...",

      "offerId": "1005064316",                   // metadane techniczne
      "url": "https://www.pracuj.pl/praca/...,oferta,1005064316",
      "scrapedAt": "2026-09-28T13:05:57.002Z",

      "location": "Bełchatów",                   // kontekst dodatkowy
      "salary": "6 700–8 570 zł brutto / mies.",
      "employmentType": "umowa o pracę"
    }
  ]
}
```

`responsibilities` (tablica) i `responsibilitiesText` (tekst) to te same
dane – wygodniej jest używać tablicy, a tekst przydaje się np. do prompta
w modelu językowym.

---

## Cloudflare – dlaczego to ważne

Strona z ofertami (`www.pracuj.pl`) jest za Cloudflare'em w trybie
**managed challenge**. To najtrudniejsza część tego zadania i warto
wiedzieć, co zostało ustalone eksperymentalnie:

- **Sam JSON-LD z listy nie wystarczy** – strona z ofertą wstawia na listing
  tylko metadane. Pełny opis zakresu obowiązków istnieje wyłącznie
  na stronie szczegółowej, więc faktycznie trzeba wejść w każdą ofertę.
- **Headless odpada** – `chromium.launch({ headless: true })` dostaje `403`
  i utyka na stronie „Cierpliwości…". Co istotne: ciasteczko `cf_clearance`
  i tak zostaje wystawione, ale ponowne wejście nadal zwraca `403`.
- **Działa profil przeglądarki na dysku** – `launchPersistentContext`
  w trybie `headed` (okno widoczne) przechodzi weryfikację. Ciasteczko
  `cf_clearance` jest ważne **rok**, więc kolejne uruchomienia wchodzą
  już bez weryfikacji.

Dlatego scraper:

- uruchamia się w trybie `headed` z katalogiem profilu `.browser-profile/`,
- po wykryciu challenge'a (`403`/`503` albo charakterystyczny tekst strony)
  czeka na pojawienie się `cf_clearance` i **ponawia wejście**,
- dopiero po wyczerpaniu prób oznacza ofertę jako nieudaną.

**Nie usuwaj katalogu `.browser-profile/`** – stracisz ciasteczko i przy
następnym uruchomieniu znów przejdziesz weryfikację (działa, ale trwa to
dłużej i jest bardziej obciążające dla serwisu).

---

## Struktura kodu

```
src/
  cli.ts                 parsowanie argumentów + wyjście z programu
  index.ts               publiczne API (użycie jako biblioteka)
  config.ts              domyślna konfiguracja
  browser.ts             sesja Playwright + obsługa Cloudflare
  types.ts               typy danych oferty
  scraper/
    listing.ts           zbieranie adresów ofert z listy
    detail.ts            wyciąganie 3 pól ze strony oferty
    run.ts               orkiestracja całego przebiegu
  storage/
    store.ts             zapis do JSON (interfejs `OfferStore`)
  utils/
    text.ts              czyszczenie tekstu, parsowanie URL
    logger.ts            logger konsolowy
tests/
  scraper.spec.ts        test integracyjny na żywej stronie
playwright.config.ts     wspólna definicja przeglądarki
```

### Użycie jako biblioteka

```ts
import { runScrape, DEFAULT_CONFIG } from "./src/index.ts";

const summary = await runScrape({ ...DEFAULT_CONFIG, limit: 25 });
console.log(summary.offers.length, summary.failed.length);
```

### Podmiana bazy

Zapis jest odizolowany interfejsem `OfferStore`, więc docelowo pod SQL
dopisujesz jedną klasę i nic więcej:

```ts
interface OfferStore {
  save(offers: JobOffer[], meta: { source: string }): Promise<string>;
}
```

---

## Uwagi techniczne

**Uruchamianie TypeScriptu.** Projekt korzysta z natywnego stripowania typów
w Node (Node ≥ 22.6), więc pliki `.ts` odpalasz wprost: `node src/cli.ts`.
Świadomie **nie** używamy `tsx` – jego transformacja przez esbuild wstrzykuje
helper `__name` do funkcji przekazywanych do `page.evaluate`, przez co każde
wywołanie w przeglądarce kończy się `ReferenceError: __name is not defined`.
Dodatkowo tryb strip-only Node nie obsługuje `enum`, `namespace` ani
właściwości w konstruktorze (parameter properties) – kod tego unika.

**Selektory.** Serwis buduje DOM wokół atrybutów `data-test`. Uwaga: wartość
`data-test` na karcie oferty **nie jest stała** – zależy od typu karty
(`default-offer` dla listy głównej, `recommended-offer` dla rekomendacji,
itd.). Stabilne są `a[data-test="link-offer"]` oraz `data-test-offerid`
na kontenerze, dlatego scraper kotwiczy się na nich, a nie na nazwie karty.

**Źródła danych na stronie oferty.** Trzy pola zbierane są wielokrotnie,
z bezpiecznym łańcuchem priorytetów:

| Pole | 1. wybór | 2. wybór | 3. wybór |
| --- | --- | --- | --- |
| stanowisko | JSON-LD `title` | `h1` | `[data-test="text-positionName"]` |
| firma | JSON-LD `hiringOrganization` | `[data-test="text-employer-name"]` | `[data-test="link-company-profile"]` |
| obowiązki | `<li>` z `[data-test="section-responsibilities"]` | JSON-LD `responsibilities` | tekst sekcji |

Sekcja „Twój zakres obowiązków" jest tu kluczowa – jej `textContent` skleja
punkty bez separatorów, dlatego czytamy pojedyncze `<li>`, a nie tekst całości.

**Kultura pracy z serwisem.** Między ofertami jest losowa pauza (1,2–2,6 s),
a pojedyncza nieudana oferta nie przerywa przebiegu – jest zapisywana na listę
`failed` i przetwarzanie idzie dalej.

---

## Test

```bash
npx playwright test -g "scraper"
```

Test integracyjny uruchamia pełny przebieg na żywej stronie i sprawdza, że
dla każdej oferty udało się wyciągnąć wszystkie trzy pola. Wymaga okna
przeglądarki (Cloudflare), więc nie wchodzi w `npm test`, który tylko
sprawdza typy.

## Ograniczenia

- `headless: true` działa **tylko** przy już zdobytym `cf_clearance`
  w katalogu profilu. Z pustym profilem nie przejdzie weryfikacji.
- Lista serwisu bywa zastępowana podzbiorem rekomendowanych ofert zamiast
  pełnej listy – wtedy `maxPages` nie da dodatkowych wyników.
- Wyciągany jest zakres obowiązków z dedykowanej sekcji. Ogłoszenia bez
  takiej sekcji dostaną `responsibilities: []` (pole jawne, nie mylące).
