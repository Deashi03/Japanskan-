# Japanskan

En app för att lära sig förstå och prata japanska. Du importerar ord som en AI har gjort
ordkort av, och appen schemalägger repetitionerna med FSRS. Den fungerar i webbläsaren på
datorn och kan installeras på mobilens hemskärm (PWA), och framstegen kan synkas mellan
enheterna.

## Så fungerar den

**Ord kommer från en AI.** Under *Ordlista → Importera* finns en färdig instruktion att kopiera.
Klistra in den hos en AI tillsammans med dina ord, och importera filen (eller klistra in svaret).
Under *Ordlista → Önskelista* kan du anteckna ord du stöter på och kopiera hela listan, med
instruktionen först, med ett tryck. `exempel-ordlista.json` visar formatet, och
`ordlistor/` innehåller de ordlistor och tillägg som följer med projektet.

**Varje ord kan ha:** läsning, betydelse, synonymer (godkänns som svar), nedbrytning per kanji,
ordklass, ämnen och sökord, grammatikförklaring, upp till 35 exempelmeningar i tre
svårighetsgrader, böjningar med exempel och vanliga förväxlingar.

**Ett pass** väljs på 5, 10, 15 eller 20 minuter:

1. Nya ord (5 som standard) presenteras ett steg i taget. De två enkla exempelmeningarna läses upp.
2. Varje nytt ord går igenom fem övningar: flerval, dra till betydelse, lyssna, svenska → japanska
   och skriv på svenska.
3. Därefter repeteras ord som ska repeteras i dag. Repetitioner består av skriva på japanska,
   lyssna på en mening och skriva på svenska, och ibland lucktext eller en mening med en böjd
   form av ordet.
4. Tar tiden slut gör appen klart de påbörjade orden och omproven, och frågar om du vill
   fortsätta med resten av dagens repetitioner.

**Ett ord räknas som "Kan"** först när det klarat lyssna, svenska → japanska och
japanska → svenska vid en repetition. Dra-övningar och flerval hjälper inlärningen men räknas inte
som bevis. Repetitioner räknas per dag; dygnet börjar klockan 04:00.

**Fel svar:** samma övning för samma ord kommer tillbaka i slutet av passet, i morgon och en
gång till inom tre dagar. Skriver du i en skrivövning i stället ett annat ord som finns i
ordlistan visas det ordet ("Du tänkte på …"), paret sparas och ordet övas i morgon.

**Svit:** varje rätt i rad får en egen kort, ljus melodi (alltid uppåtgående och på en skala som inte skaver), med en löpning var femte gång. 10, 20, 30 … får egna fanfarer och fyrverkerier.

## Publicera på GitHub Pages

1. Gå till repots **Settings → Pages** och välj **Source: GitHub Actions**.
2. Varje ändring på `main` testas och publiceras sedan automatiskt till
   `https://deashi03.github.io/Japanskan-/`.

På mobilen: öppna adressen och välj *Lägg till på hemskärmen* i webbläsarens delningsmeny.
När en ny version har laddats ned visas en knapp på startsidan.

## Synk mellan enheter (valfritt)

Utan synk sparas allt bara på den enhet du använder. För att synka:

1. Skapa ett gratis projekt på [supabase.com](https://supabase.com).
2. Kör innehållet i `supabase/schema.sql` i **SQL Editor**.
3. Lägg projektets URL och *anon public key* i `src/config.ts`.
4. Skapa ett konto under *Inställningar → Synk mellan enheter* och logga in med samma konto
   överallt.

Synken skickar upp ändringar i omgångar om högst 400 kB, hämtar i små sidor, provar om vid
nätfel och sparar framsteg löpande, så den klarar även stora importer.

## Utveckling

```bash
npm install
```

```bash
npm run dev
```

Enhetstester (logik, schemaläggning, ljudplan, synk mot en låtsasserver):

```bash
npm test
```

Webbläsartester (Playwright; bygger appen och kör fem scenarier: första passet, lyssningsövningar,
fel svar och förväxlingar, svit och ordlista). Första gången behövs webbläsaren:

```bash
npx playwright install chromium
```

```bash
npm run e2e
```

Testerna körs automatiskt för varje pull request och före varje publicering (se
`.github/workflows/`).

### Struktur

| Mapp / fil | Innehåll |
|---|---|
| `src/srs.ts` | FSRS, färdigheter, omprov, övningsval |
| `src/session.ts` | passets kö, övningar, rättning, förväxlingar |
| `src/streak.ts` | ljudplan för svit och milstolpar (ren data, testbar) |
| `src/fx.ts` | ljudmotor, uppläsning, partiklar och fyrverkerier |
| `src/store.ts`, `src/syncCore.ts`, `src/sync.ts` | lagring, synkkärna och Supabase-koppling |
| `src/importer.ts` | import av ordlistor och tilläggsfiler, AI-instruktionen |
| `src/ui/` | skärmarna |
| `e2e/` | webbläsartester |
| `ordlistor/` | ordlistor och tillägg |
