# Japanskan

En app för att lära sig japanska ord med FSRS (intervallrepetition). Fungerar i
webbläsaren på datorn och kan installeras på mobilens hemskärm.

## Så använder du appen

1. **Importera ord:** tryck på *Importera*, kopiera AI-instruktionen, klistra in den
   hos valfri AI tillsammans med dina ord och ladda upp filen du får tillbaka.
   `exempel-ordlista.json` visar formatet.
2. **Öva:** välj 5, 10, 15 eller 20 minuter. Passet börjar med nya ord (5 som
   standard) och fortsätter med repetition av gamla. Tar orden slut blir resten av
   tiden extra övning som inte påverkar schemat.
3. **Ordlista, statistik och inställningar** finns i menyn.

Ord du ofta svarar fel på flaggas som *problemord* och kommer tillbaka minst en
gång per dag tills du klarat dem tre gånger i rad.

## Publicera på GitHub Pages

1. Gå till repots **Settings → Pages** och välj **Source: GitHub Actions**.
2. Varje ändring på `main` publiceras sedan automatiskt till
   `https://deashi03.github.io/Japanskan-/`.

På mobilen: öppna adressen och välj *Lägg till på hemskärmen* i webbläsarens
delningsmeny.

## Aktivera synk mellan enheter

Utan synk sparas allt bara på den enhet du använder. För att synka:

1. Skapa ett gratis projekt på [supabase.com](https://supabase.com).
2. Öppna **SQL Editor**, klistra in innehållet i `supabase/schema.sql` och kör det.
3. Kopiera **Project URL** och **anon public key** från **Project Settings → API**
   till `src/config.ts`.
4. Skapa ett konto under *Inställningar → Synk mellan enheter* i appen och logga in
   med samma konto på alla enheter.

## Utveckling

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```
