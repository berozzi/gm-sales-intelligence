# Jak to wszystko działa

Dokument dla osoby, która pisze pierwszego scrapera w życiu. Zakłada,
że wiesz, czym jest JavaScript i Node, ale nie widziałeś jeszcze scrapowania
od zera.

Sprawdza [README.md](README.md), jeśli chcesz tylko polecenia i format danych.
Ten plik tłumaczy *dlaczego* jest tak, jak jest.

---

## Spis treści

1. [Czym w ogóle jest scraper](#1-czym-w-ogóle-jest-scraper)
2. [Co się dzieje, gdy wpisujesz adres w przeglądarkę](#2-co-się-dzieje-gdy-wpisujesz-adres-w-przeglądarce)
3. [Dlaczego Playwright, a nie zwykłe pobranie strony](#3-dlaczego-playwright-a-nie-zwykłe-pobranie-strony)
4. [Anatomia tego projektu](#4-anatomia-tyego-projektu)
5. [Przebieg krok po kroku](#5-przebieg-krok-po-kroku)
6. [Selektory — jak się dobrać do danych na stronie](#6-selektory--jak-się-dobrać-do-danych-na-stronie)
7. [Jak znalazłem te konkretne dane](#7-jak-znalazłem-te-konkretne-dane)
8. [Cloudflare — najtrudniejsza część](#8-cloudflare--najtrudniejsza-część)
9. [TypeScript i Node — dlaczego tak, a nie inaczej](#9-typescript-i-node--dlaczego-tak-a-nie-inaczej)
10. [Obrona przed zmianami na stronie](#10-obrona-przed-zmianami-na-stronie)
11. [Kultura pracy z cudzym serwisem](#11-kultura-pracy-z-cudzym-serwisem)
12. [Jak debugować scraper](#12-jak-debugować-scraper)
13. [Jak to rozbudować](#13-jak-to-rozbudować)
14. [Słowniczek](#14-słowniczek)

---

## 1. Czym w ogóle jest scraper

**Scraper (scraping danych) to program, który automatycznie odczytuje dane
ze stron internetowych i zapisuje je w ustrukturyzowanej postaci.**

Typowy przebieg:

```
strona w internecie  →  scraper odczytuje  →  dane w pliku / bazie
```

W tym repozytorium:

```
https://sprzedaz.pracuj.pl/praca  →  Playwright  →  data/offers.json
```

Czyli: bierzemy listę ofert pracy, wchodzimy w każdą ofertę osobno i z każdej
wyciągamy trzy rzeczy — **firmę**, **stanowisko** i **zakres obowiązków**.

### Dlaczego w ogóle ktoś to robi

- zbieranie ofert pracy do własnej analizy (rynku, zarobków, kompetencji),
- monitorowanie cen produktów w sklepach,
- agregacja recenzji, ogłoszeń, dokumentów,
- budowanie własnych wyszukiwarek.

### Czego scraper NIE jest

Nie jest „hackiem ani włamaniem". To po prostu program, który czyta stronę
tak, jak zrobiłby to człowiek — tyle że szybciej i w nieskończoność.
Oczywiście ma to swoje granice prawne i etyczne, o czym mówię w
[rozdziale 11](#11-kultura-pracy-z-cudzym-serwisem).

---

## 2. Co się dzieje, gdy wpisujesz adres w przeglądarce

Warto zrozumieć ten proces, bo scraper manipuluje właśnie tymi etapami.

```
Ty (przeglądarka)
  │
  │  1. HTTP GET https://sprzedaz.pracuj.pl/praca
  ▼
Serwer (komputer pracuj.pl)
  │
  │  2. Zwraca plik HTML + ciasteczka + nagłówki
  ▼
Przeglądarka
  │
  │  3. Parsuje HTML → buduje DOM (drzewo dokumentu)
  │  4. Odpytuje serwer o CSS, JS, obrazy
  │  5. Wykonuje JavaScript → strona może się dorysować
  ▼
Gotowa strona
```

### HTML, a DOM

**HTML** to tekst — źródło strony. Widać go w podglądzie źródła
(kliknięcie prawym → „Zobacz źródło strony").

**DOM** to strukturze, którą buduje z tego tekstu przeglądarka. To drzewo
złożone z węzłów i pozwala pytać: „daj mi wszystkie elementy `<li>` w tym
divie".

Przykład uproszczony:

```html
<h2>Sprzedawca (k/m) CCC</h2>
<div data-test="section-company">MODIVO PLATFORM</div>
```

Przeglądarka z tego buduje drzewo, w którym mogę zapytać:
„jaki tekst jest w pierwszym `h2`?" → `Sprzedawca (k/m) CCC`.

**Scraper prawie zawsze operuje na DOM**, nie na surowym tekście HTML.
Dlatego używamy prawdziwej przeglądarki (Playwright) zamiast czytać
pliki tekstowe.

### Ciasteczka

Serwer może poprosić przeglądarkę o zapamiętanie czegoś, np. „przeszedłeś
weryfikację, jesteś człowiekiem". Przeglądarka zapisuje to na dysku
i wysyła z powrotem przy każdym kolejnym wejściu.

To jest właśnie mechanizm, na którym opiera się obsługa Cloudflare
w tym projekcie — [rozdział 8](#8-cloudflare--najtrudniejsza-część).

---

## 3. Dlaczego Playwright, a nie zwykłe pobranie strony

Istnieją dwa zupełnie różne podejścia do czytania stron.

### Podejście A: pobranie HTML i przeparsowanie bez przeglądarki

Najprostsze narzędzia to `fetch` w Node albo `axios`:

```ts
const html = await fetch("https://sprzedaz.pracuj.pl/praca").then((r) => r.text());
```

**Zalety:** szybkie, lekkie, łatwe.

**Problem:** dostajesz surowy HTML. Jeśli strona buduje treść
przy pomocy JavaScriptu (a praktycznie każda współczesna strona to robi),
w HTML-u **nie ma** danych, których szukasz. Pusto.

### Podejście B: prawdziwa przeglądarka (Playwright)

Playwright uruchamia **prawdziwy Chromium** — ten sam silnik co Chrome —
i steruje nim jak użytkownik: otwiera strony, klika, czeka, czyta DOM.

```ts
await page.goto("https://sprzedaz.pracuj.pl/praca");
const title = await page.textContent("h1");
```

**Zalety:** wykonuje JavaScript, czeka aż strona się dorysuje, widać
okno przeglądarki (łatwiej debugować), radzi sobie z ciasteczkami.

**Wady:** cięższe, wolniejsze, większe zużycie zasobów.

### Co wybraliśmy i dlaczego

`pracuj.pl` to aplikacja zbudowana w React — treść pojawia się dopiero
po wykonaniu JavaScriptu. Dodatkowo strony ofert są za Cloudflare'em,
który reaguje na to, jaką przeglądarkę widzi.

Dlatego **Playwright był tu konieczny, a nie tylko wygodny**. Bez niego
nie dałoby się dostać do zakresu obowiązków w ogóle.

---

## 4. Anatomia tego projektu

```
src/
  cli.ts                 ← wejście programu, obsługa argumentów
  index.ts               ← publiczne API (użycie jako biblioteka)
  config.ts              ← wszystkie ustawienia w jednym miejscu
  types.ts               ← kształt danych (co jest "firmą", a co "stanowiskiem")
  browser.ts             ← uruchomienie przeglądarki + obsługa Cloudflare
  scraper/
    listing.ts           ← KROK 1: adresy ofert z listy
    detail.ts            ← KROK 2: wyciągnięcie 3 pól z oferty
    run.ts               ← orkiestracja: lista → pętla → zapis
  storage/
    store.ts             ← KROK 3: zapis do JSON
  utils/
    text.ts              ← czyszczenie tekstu, parsowanie URL
    logger.ts            ← kolorowy logger w konsoli
tests/
  scraper.spec.ts        ← test integracyjny na żywej stronie
playwright.config.ts     ← wspólna definicja przeglądarki
```

### Podział odpowiedzialności

Każdy plik ma **jedną** rolę:

| Plik | Rola | Odpowiada na pytanie |
| --- | --- | --- |
| `cli.ts` | Interfejs z użytkownikiem | „Co chcę zebrać?" |
| `config.ts` | Ustawienia | „Jak ustawić zachowanie?" |
| `browser.ts` | Obsługa przeglądarki | „Jak wejść na stronę?" |
| `listing.ts` | Krok 1 | „Jakie oferty istnieją?" |
| `detail.ts` | Krok 2 | „Co jest w tej ofercie?" |
| `run.ts` | Orkiestracja | „Co zrobić kolejno?" |
| `store.ts` | Zapis | „Gdzie to zapisać?" |
| `types.ts` | Umowa danych | „Jak to wygląda?" |

Taki podział sprawia, że zmiana w jednym miejscu nie psuje reszty.
Gdyby cała logika siedziała w jednym pliku, każda zmiana kończyłaby się
lawiną błędów.

---

## 5. Przebieg krok po kroku

Poniżej dosłowny przebieg `npm run scrape -- --limit 10`.

### Krok 0 — start przeglądarki (`browser.ts` → `start()`)

```ts
this.context = await chromium.launchPersistentContext(profileDir, {
  headless,          // false = z oknem
  channel,           // pełny Chromium, nie uproszczona wersja
  locale,            // pl-PL
  timezoneId,        // Europe/Warsaw
  userAgent,
  viewport,
  args: ["--disable-blink-features=AutomationControlled", ...],
});
```

Trzy decyzje, które mają znaczenie:

**`launchPersistentContext` zamiast zwykłego kontekstu.** Zwykły kontekst
istnieje tylko w pamięci — po zamknięciu programu znikają wszystkie
ciasteczka. `launchPersistentContext` tworzy **pełny profil przeglądarki
na dysku** (katalog `.browser-profile/`), więc ciasteczka przeżywają
między uruchomieniami. To kluczowe przy Cloudflare.

**`headless: false`.** `headless: true` uruchamia Chrome bez okna
i jest dużo łatwiejszy do wykrycia. Przy Cloudflare to różnica między
działającym a niedziałającym scraperem.

**`locale` / `timezoneId` / `userAgent`.** Ustawienia spójne z polskim
użytkownikiem. Automatyczne narzędzia często wysyłają sprzeczne dane
(np. japońska strefa czasowa z polskim językiem), a systemy antybotowe
to widzą.

### Krok 1 — wejście na listę ofert (`browser.ts` → `navigate()`)

```ts
const response = await page.goto(url, { waitUntil: "domcontentloaded" });
```

`waitUntil: "domcontentloaded"` znaczy: „poczekaj, aż przeglądarka
przeczyta i zbuduje DOM, ale nie czekaj, aż wszystkie obrazki się
załadują". To kompromis między szybkością a poprawnością — inne opcje
to `"load"` (czekaj na wszystko) i `"networkidle"` (czekaj, aż sieć
się uspokoi).

### Krok 2 — zamknięcie nakładek (`browser.ts` → `dismissOverlays()`)

Na stronie pojawiają się pasek zgód cookies i popup o zmianach
w regulaminie. Mogą zasłaniać treść i blokować kliknięcia, więc zamykamy
je zanim zaczniemy czytać.

Zauważ, że każde kliknięcie ma `.catch(() => undefined)`. **Oznacza to:
„spróbuj, ale jeśli się nie uda, jedź dalej".** Nakładka może się
pojawiać, może nie — scraper nie może od tego zależeć.

### Krok 3 — zebranie listy ofert (`listing.ts`)

```ts
const OFFER_LINK = 'a[data-test="link-offer"]';

await page.waitForSelector(OFFER_LINK, { timeout: 30_000 });
```

**`waitForSelector` to bardzo ważna linia.** Bez niej zapytalibyśmy o
elementy, zanim strona zdążyłaby je wyrenderować, i dostalibyśmy
pustą listę. To najczęstszy błąd początkujących scraperów: „działa
u mnie, a potem nagle zwraca 0 wyników".

Potem czytamy karty:

```ts
const card = anchor.closest("[data-test-offerid]");
const logo = card?.querySelector('[data-test="picture-company-logo"] img');

return {
  url: anchor.href,
  offerId: card?.getAttribute("data-test-offerid"),
  title: clean(card?.querySelector('[data-test="offer-title"]')?.textContent),
  company: clean(logo?.getAttribute("alt")),
};
```

`closest()` idzie **w górę** drzewa DOM, aż znajdzie pasujący element.
`querySelector()` schodzi **w dół**, szukając pierwszego dopasowania.

**Firmę bierzemy z atrybutu `alt` obrazka logo, nie z tekstu sekcji.**
Powód: `[data-test="section-company"]` zawierał sklejone ze sobą
trzy różne informacje:

```
"Pepco - SklepySprawdź profil firmyWarszawa, Wola"
       ↑ nazwa firmy  ↑ przycisk              ↑ lokalizacja
```

Taki bałagan. Tymczasem `alt` obrazka logo to czysta nazwa:
`"Pepco - Sklepy"`. To klasyczna lekcja: **zawsze szukaj najczystszego
źródła danych, nawet jeśli jest mniej oczywiste.**

Na koniec deduplikacja po ID oferty — na liście potrafią pojawić się
te same reklamy wielokrotnie.

### Krok 4 — wejście w każdą ofertę (`run.ts`)

```ts
for (const [index, entry] of todo.entries()) {
  const entered = await session.navigate(entry.url, label);
  // ... wyciągnięcie danych ...
  await session.politeDelay();
}
```

Pętla po kolei, nie równolegle. Dlaczego? Bo:

- **Cloudflare.** Równoległe wejścia = wygląd jak atak. Serwis zaczyna
  blokować.
- **Grzeczność.** Nie obciążamy serwera.
- **Czytelność logów.** Widać, co się dzieje, oferta po ofercie.

`politeDelay()` to losowa pauza 1,2–2,6 s. **Losowa**, nie stała —
stały interwał jest charakterystyczny dla maszyny i łatwy do
wykrycia, a także nierówno obciąża serwer.

### Krok 5 — wyciągnięcie 3 pól (`detail.ts`)

Tu jest najciekawsza część. Szczegóły w
[rozdziale 6](#6-selektory--jak-się-dobrać-do-danych-na-stronie) i
[7](#7-jak-znalazłem-te-konkretne-dane).

### Krok 6 — zapis (`store.ts`)

```ts
const db: OffersDatabase = {
  scrapedAt: new Date().toISOString(),
  source: meta.source,
  count: offers.length,
  offers,
};
await writeFile(target, `${JSON.stringify(db, null, 2)}\n`, "utf8");
```

`JSON.stringify(db, null, 2)` — drugi argument `null`, trzeci `2`
oznacza "wciągnij każdy poziom zagnieżdżenia o 2 spacje". Bez tego
otrzymalibyśmy jeden bardzo długi wiersz, w którym nic się nie
da przeczytać.

---

## 6. Selektory — jak się dobrać do danych na stronie

**Selektor to instrukcja: „znajdź mi na stronie taki element".**

### Najczęstsze selektory CSS

| Selektor | Znaczenie | Przykład |
| --- | --- | --- |
| `div` | element po nazwie znacznika | wszystkie `div`y |
| `.nazwa` | po klasie CSS | `.offer-tile` |
| `#nazwa` | po identyfikatorze | `#__NEXT_DATA__` |
| `[atrybut="wartość"]` | po atrybucie | `[data-test="offer-title"]` |
| `a[href^="https"]` | atrybut zaczyna się od | wszystkie linki zewnętrzne |
| `li:nth-child(2)` | drugi element wśród rodzeństwa | drugi punkt listy |
| `div p` | `p` wewnątrz `div` | potomek |

### Selektory, których używamy na pracuj.pl

Serwis buduje DOM wokół atrybutów `data-test` — to wewnętrzny znacznik
do testów, dzięki któremu programiści wiedzą, który element za co
odpowiada. Dla nas jest złotem: stabilny i czytelny, w przeciwieństwie
do generowanych nazw klas.

```ts
'a[data-test="link-offer"]'                        // link do oferty
'[data-test="offer-title"]'                        // tytuł oferty
'[data-test="picture-company-logo"] img'           // logo firmy
'[data-test-offerid]'                              // kontener karty (dowolny typ)
'[data-test="text-positionName"]'                  // stanowisko
'[data-test="text-employer-name"]'                 // firma
'[data-test="section-responsibilities"]'           // sekcja obowiązków
'[data-test="job-schema-org"]'                     // dane strukturalne
```

### Dlaczego `[data-test-offerid]`, a nie `data-test="default-offer"`?

To była jedna z ważniejszych rzeczy, jakie wyszły w trakcie pracy.

Początkowo karty ofert wyglądały tak:

```html
<div data-test="default-offer" data-test-offerid="1005082537">
```

Wyglądało, że `default-offer` to stały znacznik karty oferty. Ale przy
następnym uruchomieniu scraper nagle zwrócił **zero** ofert. Okazało się,
że serwis w pewnych sytuacjach serwuje podzbiór *rekomendowanych* ofert
zamiast pełnej listy i wtedy znacznik wygląda tak:

```html
<div data-test="recommended-offer" data-test-offerid="1005118172">
```

Ten sam typ strony, zupełnie inna wartość. Serwis zmienia ją zależnie
od sytuacji.

Rozwiązanie: kotwiczymy się na elemencie, który **jest** stały —
`a[data-test="link-offer"]` (link do oferty, jest zawsze) — a kartę
znajdujemy przez `closest("[data-test-offerid]")`, który działa
niezależnie od typu karty.

**Lekcja: nie ufaj pojedynczemu elementowi atrybutu. Szukaj struktury,
która musi istnieć zawsze.**

### `evaluate` — zapytania JavaScript w przeglądarce

Czasem selektor nie wystarczy i trzeba zrobić coś bardziej złożonego.
Wtedy używamy `page.evaluate()` — przekazujemy funkcję, która wykonuje
się **w przeglądarce**, na żywym DOM:

```ts
const title = await page.evaluate(() => document.querySelector("h1")?.textContent);
```

Zasada, o którą łatwo się potknąć: **taka funkccja nie ma dostępu do
zewnętrznego świata.** Playwright dosłownie bierze jej kod, zamienia
na tekst i wkleja do strony. Zmienne z Node tu nie dotrą:

```ts
const sel = "h1";

// ❌ BŁĄD - `sel` nie istnieje w przeglądarce
await page.evaluate(() => document.querySelector(sel));

// ✅ DOBRZE - przekazujemy wartość jako argument
await page.evaluate((s) => document.querySelector(s), sel);
```

Drugi argument `evaluate` to lista argumentów do przekazania — one
jedynie trafiają do przeglądarki.

---

## 7. Jak znalazłem te konkretne dane

To najbardziej przenośna umiejętność w całym projekcie. Same selektory
to efekt końca; liczy się proces.

### Krok 1 — zacząłem od pytania „jakie dane w ogóle istnieją?"

Zamiast zgadywać selektory, najpierw sprawdziłem, czy serwis **sam**
udostępnia dane w ustrukturyzowanej postaci. Otworzyłem listę ofert
i przejrzałem źródło strony.

Okazało się, że jest tam `<script id="__NEXT_DATA__">` — 198 kB JSON-a.
To dane, które Next.js wysyła do przeglądarki, żeby ta mogła się
szybko wyrenderować.

**Pierwsza wniosek: na liście jest 198 kB danych, czyli około 4 kB
na ofertę.** To dużo… ale wystarczyło mi tylko na metadane.
Pełnego opisu nie było. Wniosek: **muszę wejść w każdą ofertę osobno**,
tak jak zresztą brzmiało zadanie.

### Krok 2 — sprawdziłem, czy jest jakieś API

Zanim zacząłem walczyć z przeglądarką, sprawdziłem, czy serwis nie ma
publicznego API. Podpiąłem się do tego, co strona i tak już pobiera:

```ts
page.on("request", (req) => {
  if (req.resourceType() === "xhr" || req.resourceType() === "fetch") {
    console.log(req.url());
  }
});
```

Wynik: `https://massachusetts.pracuj.pl/jobOffers/listing/count?...`

Próbowałem zgadywać endpoint pojedynczej oferty:

```
/jobOffers/1005122050                  → 404
/api/jobOffers/1005122050              → 404
/jobOffers/details/1005122050          → 404
... 8 wariantów, wszystkie 404
```

**Wniosek: API jest, ale endpointu pojedynczej oferty nie ma (albo jest
niedostępny).** Zajęcie API odpadło — zostaje HTML.

### Krok 3 — otworzyłem jedną ofertę i zacząłem szukać pól

Tutaj zrobiłem coś, co jest **kluczową umiejętnością**: zamiast losowych
zgadywań, **wypisałem wszystkie atrybuty `data-test` z całej strony**:

```ts
const attrs = await page.evaluate(() => {
  const out: string[] = [];
  for (const el of document.querySelectorAll("*")) {
    for (const a of el.attributes) {
      if (a.name.startsWith("data-test")) out.push(`${a.name}="${a.value}"`);
    }
  }
  return [...new Set(out)].sort();
});
```

To dało mi gotową listę możliwości. Wśród ~200 atrybutów znalazłem
rzeczy, które od razu wyglądały obiecująco:

```
data-test="text-positionName"                 ← stanowisko!
data-test="text-employer-name"                ← firma!
data-test="section-responsibilities"          ← obowiązki!
data-test="job-schema-org"                    ← dane strukturalne!
```

**Ta technika jest niezwykle skuteczna i powinna być Twoim domyślnym
podejściem.** Zamiast zgadywać `div > div > span:nth-child(2)`, po prostu
sprawdzasz, co serwis sam oznaczył.

### Krok 4 — znalazłem JSON-LD, czyli dane „dla robotów"

`data-test="job-schema-org"` okazał się znaczkiem JSON-LD — standardem
schema.org. To jest blok `<script type="application/ld+json">`, w którym
serwis opisuje ofertę **z myślą o wyszukiwarkach i agregatorach**:

```json
{
  "@type": "JobPosting",
  "title": "Pracownik Sklepu (M/K)",
  "hiringOrganization": "TEDi Sieć Handlowa Sp. z o.o.",
  "responsibilities": "obsługa kasy fiskalnej, eksponowanie towaru...",
  "employmentType": "umowa zlecenie",
  "datePosted": "2026-09-11T14:09:09.587Z"
}
```

To **najlepsze źródło danych, jakie można znaleźć na stronie.** Jest
ustandaryzowane, nie zależy od wyglądu strony i nie psuje się przy
zmianie kolorów czy układu.

**Zasada: zanim zaczniesz grzebać w HTML-u, sprawdź czy strona nie
daje Ci danych w ustrukturyzowanym formacie.** JSON-LD, schema.org,
`<meta property="og:title">` — to gotowe, czyste dane.

### Krok 5 — porównałem wyniki i ustaliłem kolejność priorytetów

Sprawdziłem tę samą ofertę na kilka sposobów i porównałem:

| Źródło | Wynik |
| --- | --- |
| JSON-LD `responsibilities` | `"obsługa kasy fiskalnej zgodnie z..., , eksponowanie towaru...,"` ← **kropki-duplikaty, jeden wielki string** |
| `<li>` z sekcji obowiązków | `["obsługa kasy fiskalnej", "eksponowanie towaru", ...]` ← **czysta lista** |

Serwis sklejał punkty z przecinkami, a część z nich już kończyła się
przecinkiem — stąd podwójne przecinki. Z DOM wyciągam **pojedyncze
elementy listy**, więc mam czystą strukturę.

Dlatego w kodzie JSON-LD jest **wymianem**, a nie głównym źródłem
(czyli np. pole `title` i `hiringOrganization` stamtąd biorę bez
problemu, a obowiązki z DOM).

### Krok 6 — sprawdziłem, czy strona się zmienia

Zauważyłem, że kolejne uruchomienia zwracały różne wyniki. Zbadałem
dlaczego i okazało się, że `default-offer` zmienia się w
`recommended-offer` — serwis podmienia listę na rekomendowaną, gdy
główna nie zdołała się wczytać. Z tego powodu powstał stabilny
selektor opisany w [rozdziale 6](#6-selektory--jak-się-dobrać-do-danych-na-stronie).

### Podsumowanie procesu

```
1. Sprawdź, czy strona daje dane ustrukturyzowane (JSON-LD, API, __NEXT_DATA__)
2. Wypisz wszystkie atrybuty data-test / class / id na stronie
3. Zrób zrzut ekranu i tekstu strony
4. Sprawdź, co strona sama o sobie mówi (meta tagi, JSON-LD)
5. Porównaj kilka ofert — łatwiej wtedy zauważyć różnice
6. Użyj selektora najczystszego, nie najprostszego
7. Zabezpiecz się przed zmianami (fallbacki)
```

---

## 8. Cloudflare — najtrudniejsza część

To była właściwa trudność tego zadania. Selektory to było proste
zadanie programistyczne. Poniżej pełne wyjaśnienie, bo na pewno
spotkasz się z tym przy kolejnym projekcie.

### Czym jest Cloudflare

Cloudflare to firma świadcząca usługi **ochrony przed botami**. Stoi
przed większością dużych serwisów. Gdy uzna, że wejście podejrzane,
podstawia pod nim swoją stronę z weryfikacją.

Strony ofert `pracuj.pl` są za taką weryfikacją. Komunikat brzmi po polsku:
> „Przeprowadzanie weryfikacji zabezpieczeń. Ta witryna jest chroniona
> przed złośliwymi botami za pomocą usługi bezpieczeństwa."

Tytuł strony to „Cierpliwości…". Serwer zwraca status **403**.

### Co sprawdza Cloudflare

- **Nagłówki HTTP** — `User-Agent`, `Accept-Language`, nagłówki klienta.
- **Ciasteczka i sesję** — czy zachowują się jak normalny użytkownik.
- **Ślad automatyzacji** — `navigator.webdriver` i podobne, które
  wskazują, że steruje automat.
- **Profil urządzenia** — rozdzielczość, czcionki, GPU, liczba rdzeni.
  Headless ma inne niż „prawdziwy" Chrome i to jest widoczne.
- **Zachowanie** — czy ładujesz 50 stron w 5 sekund.

### Eksperymenty, które wykonałem

Opisuję je, bo pokazują metodę myślenia przy debugowaniu.

**Eksperyment 1: zwykły headless.**

```ts
await page.goto("https://www.pracuj.pl/praca/...,oferta,1005122050");
// → status 403, strona "Cierpliwości…"
```

**Eksperyment 2: czy to wykrywa nasz User-Agent?** Podmieniłem
User-Agent na typowy Windows/Chrome. Nadal 403.

**Eksperyment 3: czy problemem jest brak kontekstu przeglądarkiego?**
Użyłem `context.request.get()` — czyli zwykłe zapytanie HTTP, ale
z ciastkami i nagłówkami z prawidłowego kontekstu przeglądarki.
Wynik: `403`, nagłówek `cf-mitigated: challenge`.

**Eksperyment 4: czy wystarczy kliknąć jak człowiek?** Kliknąłem
link do oferty na liście. Nadal 403.

**Eksperyment 5: czy to po prostu wolno?** Czekałem 60 sekund,
sprawdzając co 2,5 s. Strona **nigdy** się nie rozładowała.
Tytuł cały czas: „Cierpliwości…". Ale zauważyłem coś ważnego —
**ciasteczko `cf_clearance` się pojawiło**, a URL wyczyścił się
z parametru `__cf_chl_rt_tk`.

To był przełomowy moment: weryfikacja **się powiodła**, tylko strona
się nie odświeżyła. Próbowałem `page.goto()` ponownie na czysty URL
— znowu 403.

**Eksperyment 6: pełny Chromium + profil na dysku + okno.**

```ts
chromium.launchPersistentContext(".browser-profile", {
  headless: false,
  channel: "chromium",
  args: ["--disable-blink-features=AutomationControlled"],
});
```

**Status 200. Treść wczytana.** Pierwszy raz od początku.

### Wnioski

1. **Headless odpada.** Nie dlatego, że coś jest źle skonfigurowane —
   po prostu `headless: true` zostawia ślady, które Cloudflare widzi.
   Ciasteczko `cf_clearance` i tak było wystawiane, co potwierdza, że
   JavaScript się wykonał, ale weryfikacja i tak nie zaliczona.

2. **Profil na dysku ma znaczenie.** `launchPersistentContext` tworzy
   prawdziwy profil — z historią, preferencjami, pustą bazą danych.
   To profil prawdziwej instalacji Chrome, a nie tymczasowy kontener.

3. **Ciasteczko `cf_clearance` jest ważne rok.** Sprawdziłem datę
   wygaśnięcia. Zapisane w katalogu `.browser-profile/` przeżywa
   między uruchomieniami, więc **drugie uruchomienie wchodzi
   natychmiast, bez żadnej weryfikacji**.

4. **Retrying z odczekaniem na ciasteczko** działa jako zabezpieczenie.
   Gdyby weryfikacja się nie rozładowała sama, scraper nie wrzuca
   ręcznie strony do DOM — to zawsze ryzykowne i kruche.

### Jak to jest zaimplementowane

W `browser.ts` → `navigate()`:

```ts
for (let attempt = 1; attempt <= maxChallengeRetries; attempt++) {
  const response = await page.goto(cleanUrl, { waitUntil: "domcontentloaded" });
  const status = response?.status() ?? 0;

  if (!(await this.isChallenged(status))) return status < 400;

  // Czekamy aż przeglądarka dostanie ciasteczko, potem wchodzimy ponownie.
  if (await this.waitForClearance()) {
    await page.waitForTimeout(1_500);
    continue;
  }
}
return false;
```

`isChallenged()` sprawdza dwie rzeczy: status `403`/`503` **albo**
obecność charakterystycznych napisów na stronie. Ta druga gałąź jest
ważna — niektóre wyzwania Cloudflare zwracają `200`, a mimo to
pokazują stronę weryfikacyjną.

### Pragmatyczne nastawienie

- `--headless true` **działa**, ale tylko z już zdobytym `cf_clearance`
  w katalogu profilu. Bez niego — nie.
- Dlatego w `config.ts` jest komentarz, że `headless: false` jest
  obowiązkowe, a w CLI przy uruchomieniu w trybie headless pojawia się
  ostrzeżenie.
- Gdyby weryfikacja stała się nie do przejścia, realna droga to
  kontakt z serwisem (dane testowe, dostęp do API) — **nie** obchodzenie
  zabezpieczeń.

---

## 9. TypeScript i Node — dlaczego tak, a nie inaczej

Kilka decyzji technicznych, które warto znać.

### Uruchamianie TypeScriptu

Projekt używa **natywnego stripowania typów wbudowanego w Node**:

```bash
node src/cli.ts
```

Node 22.6+ potrafi sam usunąć typy z pliku `.ts` i uruchomić go
bez żadnego dodatkowego narzędzia. Zero konfiguracji, zero
transpilacji.

**Ograniczenia tego trybu** (nazywanego *strip-only*):
- ❌ `enum` i `namespace` — trzeba używać zwykłych obiektów i `const`,
- ❌ właściwości w konstruktorze (*parameter properties*),
- ❌ `experimentalDecorators`.

Kod tego unika. Na przykład zamiast parameter properties:

```ts
// ❌ nie zadziała w strip-only
export class JsonFileStore implements OfferStore {
  constructor(protected readonly filePath: string) {}
}

// ✅ jawnie
export class JsonFileStore implements OfferStore {
  protected readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }
}
```

### Dlaczego usunąłem `tsx`

To była realna przeszkoda, nie kwestia gustu.

`tsx` to popularne narzędzie do uruchamiania TypeScriptu. Działa
przez esbuild. Problem: esbuild (w konfiguracji `keepNames`) wstawia
do kodu pomocniczą funkcję `__name`, żeby zachować nazwy funkcji
w stacktrace'ach.

Cyk życia wygląda tak:

```
napisany kod
  → tsx/esbuild (wstawia __name)
    → Node
      → Playwright: page.evaluate(funkcja)
        → funkcja wysłana do PRZEGLĄDARKI
          → ReferenceError: __name is not defined  ← 💥
```

Playwright **serializuje** funkcję do tekstu i wkleja ją w stronie.
`__name` istnieje w Node, ale **nie istnieje w przeglądarce**.
Wystarczyła jedna nazwanej funkcji zagnieżdżonej, żeby wszystkie
wywołania `page.evaluate` wybuchły.

Zweryfikowałem to, i potwierdziłem, że natywny tryb Node nie ma
problemu. Stąd decyzja.

**Lekcja: narzędzia pośrednie między edytorem a przeglądarką potrafią
wprowadzać artefakty, których nie widać. Gdy coś dziwnie mówi, że
jakaś zmienna „nie istnieje", sprawdź, co robi warstwa pośrodku.**

### Importy z rozszerzeniem `.ts`

```ts
import { runScrape } from "./scraper/run.ts";
```

Tak Node rozpoznaje pliki TypeScript. Wymaga w `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "noEmit": true,                     // tylko sprawdzanie typów
    "allowImportingTsExtensions": true, // zgoda na importy z .ts
  }
}
```

### `verbatimModuleSyntax`

Wymusza pisanie `import type` dla samych typów:

```ts
import { chromium } from "playwright";
import type { BrowserContext, Page } from "playwright";
```

Dzięki temu wiadomo, co jest wartością, a co typem — to ułatwia
refaktoryzację i przyspiesza kompilator.

### `lib: ["esnext", "dom"]`

Standardowo Node nie zna `document` ani `querySelector`. Ale my **operujemy
na DOM przeglądarki** w `page.evaluate`. Stąd `"dom"` w konfiguracji.

### `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`

Włączone wszystkie. To znaczy, że TypeScript **zmusza** do pisania kodu
odpornego na braki danych — a scraper z definicji operuje na danych,
których może nie być.

```ts
const entries = results[0];          // typ: T | undefined
const entries = results[0]!;         // "wiem, że istnieje" - ryzykowne
entries?.someField                   // obsługa braku
```

Dzięki temu nie zapomnisz sprawdzić, czy element faktycznie istnieje,
zanim się do niego dobierzesz.

---

## 10. Obrona przed zmianami na stronie

Serwisy żyją i zmieniają się. Każdy scraper wcześniej czy później
zepsuje. Kilka technik, które tu zastosowałem:

### a) Łańcuch źródeł zamiast jednego

Nigdy nie ufam jednemu selektorowi:

```ts
company: firstOf(
  raw.ldOrg,          // 1. JSON-LD
  raw.employerName,   // 2. atrybut data-test
  raw.companyProfile, // 3. link do profilu firmy
  raw.logoAlt,        // 4. alt obrazka logo
)
```

`firstOf()` zwraca **pierwszą niepustą** wartość. Jeśli JSON-LD
zniknie, dane wciąż się zbiorą — tylko z innego miejsca.

### b) Jawne `null` zamiast zgadywania

```ts
// ❌ Niebezpieczne: udaje, że wiemy
company: document.querySelector("...")?.textContent ?? "Nieznana firma"

// ✅ Uczciwe: sygnalizuje brak danych
company: firstOf(...)   // → string | null
```

Puste `null` w bazie to **informacja**. Wymyślona nazwa firmy to **błąd**,
który wyjdzie dopiero przy analizie danych, tydzień później.

### c) Raportowanie, nie ciche pomijanie

```ts
const missing = [
  !offer.company && "firma",
  !offer.position && "stanowisko",
  offer.responsibilities.length === 0 && "zakres obowiązków",
].filter(Boolean);

return { offer, error: missing.length > 0 ? `brak pól: ${missing.join(", ")}` : null };
```

Oferta z brakami **zapisuje się do `failed`**, ale przebieg trwa dalej.
W logu widać dokładnie, które pole nie wyszło i w której ofercie.

### d) Rozrzucanie opóźnień

```ts
export function sleepBetween(range: [number, number]): Promise<void> {
  const [min, max] = range;
  const ms = min + Math.random() * Math.max(0, max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

Stały interwał jest jak stuk metronomu — łatwo wykrywalny. Losowy
odstęp wciąż jest uprzejmy, ale wygląda naturalnie.

### e) `--save-html` do diagnostyki

```bash
npm run scrape -- --limit 3 --save-html
```

Zapisuje pełny HTML każdej oferty. Gdy coś przestanie działać, możesz
otworzyć ten plik i zobaczyć, co strona faktycznie zwróciła — zamiast
zgadywać.

---

## 11. Kultura pracy z cudzym serwisem

Technicznie da się zrobić wszystko. **Nie wszystko należy.**

### Zasady, których tu przestrzegamy

✅ **Losowe opóźnienia** między stronami — nie obciążamy serwera.

✅ **Sekwencyjne przetwarzanie** — nigdy równolegle w dziesiątki okien.

✅ **Tylko strony publiczne** — nie logujemy się, nie omijamy
   uwierzytelniania, nie pobieramy ofert, które wymagają konta.

✅ **Lokalne wyłącznie** — dane zostają na dysku, nigdzie się nie
   wysyłamy.

✅ **Sprawdzaj regulamin i `robots.txt`.** Jeśli serwis tego zabrania —
nie rób tego. Dla poważnych zastosowań (research, hurtownie danych)
istnieją legalne ścieżki: kontakt z działem danych, API, licencja.

### Czego nie robimy

- ❌ Omijanie uwierzytelniania, płatnych barier czy zabezpieczeń
  w sposób zaprojektowany, żeby je złamać.
- ❌ Masowe pobieranie setek tysięcy ofert.
- ❌ Wykorzystywanie danych osobowych w sposób naruszający RODO.
- ❌ Podawanie się za człowieka w celu obejścia weryfikacji Cloudflare.

**Cloudflare z `launchPersistentContext` w trybie headed to granica.**
Użytkownik siedzi przy komputerze, przeglądarka jest widoczna, a
`cf_clearance` to ciastko wystawione *jemu*. To nie jest omijanie
zabezpieczeń — to normalne przechodzenie weryfikacji przez
rzeczywistą przeglądarkę na rzeczywistym komputerze.

Gdyby było trzeba obejść weryfikację, żeby dostać się do treści,
do której normalny użytkownik nie ma dostępu — to jest granica, za
którą scraper nie powinien wchodzić. Wtedy rozmowa z serwisem.

---

## 12. Jak debugować scraper

Kolejność, która oszczędza czas. Użyłem jej praktycznie przy każdym
problemie w tym projekcie.

### 1. Zapisz to, co naprawdę widzisz

```ts
import { writeFileSync } from "node:fs";
writeFileSync("dump.html", await page.content());
```

Najpierw sprawdź, czy w ogóle dostałeś treść. Często problem jest
wcześniej niż myślisz.

### 2. Wypisz tekst strony

```ts
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 2000));
```

Szybko zobaczysz, czy to strona Cloudflare („Przeprowadzanie weryfikacji
zabezpieczeń"), czy popup zasłaniający treść, czy pusta strona.

### 3. Policz elementy

```ts
console.log("kart:", await page.locator('[data-test="default-offer"]').count());
console.log("linków:", await page.locator('a[data-test="link-offer"]').count());
```

Jeśli wychodzi 0, ale strona wygląda normalnie — problem jest w
selektorze albo w renderowaniu.

### 4. Wypisz wszystkie atrybuty `data-test`

Ta magiczna technika z [rozdziału 7](#7-jak-znalazłem-te-konkretne-dane):

```ts
const attrs = await page.evaluate(() => {
  const out: string[] = [];
  for (const el of document.querySelectorAll("*")) {
    for (const a of el.attributes) {
      if (a.name.startsWith("data-test")) out.push(`${a.name}="${a.value}"`);
    }
  }
  return [...new Set(out)].sort();
});
console.log(attrs.join("\n"));
```

### 5. Podejrzyj czekanie

Jeśli działo, a potem nagle zwraca 0 wyników — prawie na pewno
czekasz za krótko. Dodaj `waitForSelector()`.

### 6. Podejrzyj selektor, nie dane

Różnica jest subtelna, ale istotna: „nie mam danych" znaczy zwykle
„nie umiem wskazać miejsca, w którym są".

### 7. Sprawdź, czy to nie Cloudflare

Status 403 i „Cierpliwości…" to jednoznaczny sygnał. Zanim zaczniesz
poprawiać selektory, upewnij się, że w ogóle ładujesz właściwą stronę.

### Ściągawka

| Objaw | Pierwsza hipoteza |
| --- | --- |
| 0 wyników, strona wygląda OK | za krótkie czekanie |
| 0 wyników, „Cierpliwości…" | Cloudflare |
| 403 | Cloudflare |
| Działo, potem przestało | serwis zmienił DOM, albo rate limit |
| Tekst sklejony bez spacji | czytasz `textContent` kontenera zamiast elementów |
| `__name is not defined` | `tsx` + `page.evaluate` |
| `not supported in strip-only mode` | `enum` / parameter property |

---

## 13. Jak to rozbudować

Naturalne kolejne kroki, od najprostszego.

### Podmiana bazy na prawdziwą

Zapis jest odizolowany interfejsem:

```ts
interface OfferStore {
  save(offers: JobOffer[], meta: { source: string }): Promise<string>;
}
```

Aby dodać SQL, piszesz jedną klasę i **nic więcej** — reszta kodu
się nie zmienia:

```ts
class SqliteStore implements OfferStore {
  async save(offers: JobOffer[]): Promise<string> {
    // ...
  }
}
```

To jest cały sens oddzielenia logiki od zapisu.

### Więcej pól

`detail.ts` już zbiera `location`, `salary`, `employmentType`. Łatwo
dodać np. `datePosted` z JSON-LD albo dane o firmie z
`section-employer-profile`.

### Kolejne job boardy

Nowy serwis = nowy moduł w `scraper/` implementujący te same funkcje.
Pozostałe pliki zostają bez zmian. Dodatkowo warto zrobić osobną
konfigurację na wyjątki (np. inny tryb headless, inne ciasteczko).

### Wznawianie po przerwaniu

`offerId` jest już zapisywany. Wystarczy przy starcie wczytać istniejący
plik i pominąć oferty już obecne — dlategy istnieje tryb `--append`.

### Pętla z harmonogramem

```ts
// codziennie o 6:00
await runScrape({ limit: 100, outFile: "data/daily.json" });
```

Do tego historia zmian ofert po `datePosted`.

### Współbieżność, ale ostrożnie

Można otworzyć kilka kontekstów naraz, ale wtedy **trzeba** pilnować
tempa, inaczej wpadniesz w Cloudflare. Jeśli już, to 2–3 strony
jednocześnie z dłuższymi opóźnieniami — nie 20.

---

## 14. Słowniczek

**Bot** — program wykonujący zadania automatycznie.

**Scraper** — program pobierający dane ze stron.

**Crawl / crawling** — przechodzenie przez strony, zwykle rekurencyjnie
(np. z każdej strony na wszystkie, które z niej prowadzą).

**DOM** — drzewo dokumentu zbudowane przez przeglądarkę z HTML-a.

**Selektor** — instrukcja wskazująca element na stronie (np. `h1`).

**Headless** — przeglądarka bez okna graficznego.

**User-Agent** — nagłówek HTTP identyfikujący klienta.

**Ciasteczko (cookie)** — mały fragment danych zapamiętywany przez
przeglądarkę i wysyłany z powrotem przy kolejnych wejściach.

**HTTP status** — kod wyniku żądania: `200` OK, `403` zabroniony,
`404` nie znaleziono, `503` niedostępne.

**JSON-LD / schema.org** — ustrukturyzowane dane osadzone w stronie
dla wyszukiwarek i agregatorów. Najlepsze źródło przy scrapowaniu.

**Rate limit** — limit liczby żądań w czasie.

**Anti-bot / WAF** — system ochrony przed automatycznym ruchem
(np. Cloudflare).

**Await** — w JS czekanie na wynik operacji asynchronicznej.

---

## Na koniec: trzy zdania do zapamiętania

1. **Najpierw zrozum stronę, potem pisz selektory.** Sprawdź JSON-LD,
   API i `data-test`, zanim zaczniesz grzebać w HTML-u.

2. **Czekanie jest częścią scrapowania.** Strona jest dynamiczna —
   kod, który nie czeka na element, prędzej czy później zwróci pustkę.

3. **Scraper zawsze się zepsuje.** Serwisy się zmieniają. Pisz kod tak,
 żeby awaria była zrozumiała z samego logu — a nie tajemnicza.
