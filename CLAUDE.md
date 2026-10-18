# ScioCamp

Školní systém pro řízení chodu školy: ~150 studentů, ~10 učitelů. Komunikace s autorem (Šimon) probíhá česky.

## Návrh UI

- Kompletní návrh je ve složce `design/` (soubory `*.dc.html`, jedna obrazovka = jeden soubor) a v artefaktu „ScioCamp – redesign“ na claude.ai: https://claude.ai/artifact/Ybr2iKopJ2D4PA9wKFLfVx
- Autor návrh schválil, drobnosti se budou ladit průběžně. Při stavbě se drž jeho vzhledu.
- Obrazovky: Prihlaseni, Main (Domov), Zapisy, Ukoly, Hlasovani, Zpravy, Kurzy, Trida (detail třídy ve stylu Classroomu), UkolDetail, Ateliery, Navrhy, Profil, Nastaveni, Ucitel, Admin, Sidebar (navigace podle role).

### Design tokeny

- Písmo: Plus Jakarta Sans (400–800)
- Pozadí `#F4F6FB`, karty `#FFFFFF`, okraje `#E3E8F2` / `#EEF1F7`
- Text `#111A33`, sekundární text `#3A4560`, tlumený text `#5A6782`
- Primární `#3B6FE0`, tmavší `#2F5FCC`, text na světlém `#1F4FB8`, světlá výplň `#E8EFFD`, `#C9D8FA`
- Stavy: hotovo `#17704A` na `#E3F4EC`, čeká `#8A5300` na `#FDF1DC`, po termínu `#A82E2E` na `#FBE7E7`
- Typy aktivit: kurz modrá, ateliér `#5B4BC4` / `#EEEAFD`, ostatní/expedice `#0F6B5F` / `#E0F2EF`
- Zaoblení: karty 18 px, tlačítka 12 px; dotykové cíle min. 44 px

## Rozhodnutí

- Role: student, učitel, admin. Úkoly a kurzy zadává učitel i admin. Účty zakládá admin (žádná veřejná registrace).
- Přihlášení primárně přes Google, ale jen účty s doménou `@scioskola.cz` (školní Google Workspace); jiné domény odmítnout (ověřovat na serveru, ne jen parametrem `hd`).
- Studenti pod 18 let mají v Google Workspace for Education přihlášení přes Google do aplikací třetích stran ve výchozím stavu blokované, dokud ho admin Workspace nepovolí. Proto je e-mail + heslo plnohodnotná cesta, ne jen záloha. Autor k Workspace přístup nemá; škola si Google (a později Meet přes Calendar API) povolí sama.
- Záloha: přihlášení stejným školním e-mailem a vlastním heslem do aplikace (Supabase e-mail + heslo). Heslo si uživatel nastaví sám přes odkaz z pozvánky a přes „Zapomenuté heslo?“ si ho obnoví e-mailem.
- Každý předmět, ateliér a událost v rozvrhu má odkaz na Google Meet (vytvářený přes Google Calendar API, přístup pro školní doménu). Vlastní kalendář aplikace, Google Kalendář jen jako volitelná synchronizace.
- Odkaz na Meet u kurzu/ateliéru může vložit nebo změnit vyučující dané třídy a admin (tlačítko „Vytvořit nový Meet“ otevře meet.google.com/new). Automatické vytváření přes Calendar API přijde, až ho škola povolí.
- Škola nemá třídy, jen ročníky (1.–4.). Kurzy a ateliéry jsou otevřené všem ročníkům, některé jen pro vybrané (např. maturanti) — pole „povolené ročníky“.
- Hodnocení bez známek: body z maxima, které učitel nastaví u úkolu; stav úkolu splněno / nesplněno / vráceno k doplnění (s požadavkem); slovní hodnocení.
- Kurzy a ateliéry mají funkce jako Google Classroom: nástěnka, úkoly a materiály podle témat, odevzdávání souborů a Google dokumentů, soukromé komentáře s vyučujícím, týmové úkoly s týmovým chatem, chat třídy, hodnocení s body, kvízy.
- Stack: Next.js (App Router) + TypeScript, Supabase (Postgres, auth, realtime, storage), hosting Vercel.

## Etapy

1. Přihlášení, role, kurzy, rozvrh a Meet (zatím na ukázkových datech, pak Supabase)
2. Úkoly, odevzdávání a hodnocení
3. Chaty, nástěnka a notifikace
4. Zápisy, hlasování a návrhy

## Implementace (stav)

- Etapa 1 hotová (naostro se Supabase): přihlášení (ukázkové účty místo Google OAuth), role, Domov s rozvrhem a Meetem, Kurzy, Ateliéry, detail třídy (`/kurzy/[id]`, `/ateliery/[id]`), Moje třídy, Správa, Profil. Ostatní stránky jsou zástupné.
- Next.js 16.4 má zapnuté Cache Components: vše, co čte cookies/session, musí být za `<Suspense>` (layout `src/app/(app)/layout.tsx` to řeší pro všechny stránky). Middleware se jmenuje `src/proxy.ts`. Před psaním kódu čti dokumentaci v `node_modules/next/dist/docs/`.
- Data jen přes `src/lib/data.ts` (async funkce, připravené na Supabase). Čas vždy přes `src/lib/time.ts` (pásmo Europe/Prague).
- Styly: design tokeny v `src/app/globals.css`, komponenty přes CSS moduly.
- Supabase projekt `sciocamp` (id `gmpvzyvrutaoxcicpnqt`, Frankfurt) běží, migrace nasazené (Supabase konektor), přihlášení e-mailem ověřené naostro; autor je admin (simon.liska@scioskola.cz). Autor pracuje na Windows ve VS Code (PowerShell: používat `npm.cmd`). Registrace vypnutá. Vlastní SMTP zatím není: e-maily chodí jen členům týmu a šablony nejdou upravit — pozvánky z výchozího e-mailu zpracuje `/auth/prijeti` (tokeny za #).
- Dva režimy (`src/lib/config.ts`): s proměnnými Supabase naostro, bez nich ukázkový režim s `src/lib/demo-data.ts`. Oba musí fungovat.
- Supabase: schéma a RLS v `supabase/migrations/` (testy `npm run test:db` v PGlite — při každé změně oprávnění přidat test). Klienti v `src/lib/supabase/`. Secret key jen v serverových akcích admina po `requireAdmin()`.
- Přihlášení: `/auth/callback` (Google, PKCE), `/auth/confirm` (odkazy z e-mailů, token_hash), `/nastavit-heslo`. Po přihlášení `finishSignIn` znovu ověří doménu a profil. Registrace v Supabase je vypnutá, účty zakládá admin pozvánkou.
- Serverové akce v `src/lib/actions/`. Návod k nastavení Supabase: `docs/supabase-nastaveni.md`.
- Ukázkový režim: změny (role v adminu, Meet, chat, odevzdání) se neukládají a UI to říká.
- Etapa 2 (úkoly) hotová: `/ukoly` (student: přehled s filtry; učitel: úkoly svých tříd a počty k opravení), `/ukoly/novy`, `/ukoly/[id]` (student odevzdává soubory do Storage bucketu `odevzdani` přímo z prohlížeče + odkazy + poznámku; učitel hodnotí přes `?student=`), `/ukoly/[id]/upravit`. Data v `src/lib/data-assignments.ts`, akce v `src/lib/actions/assignments.ts`, stav práce počítá `workState()` v `src/lib/assignments.ts`. Týmové úkoly a kvízy zatím ne.
- Formuláře s `useActionState` odesílat přes `onSubmit={keepForm(action)}` (`src/lib/use-keep-form.ts`), ne `action={…}` — React 19 by po chybě formulář vymazal.
- Google přihlášení se v UI zapíná proměnnou `NEXT_PUBLIC_GOOGLE_LOGIN=1` (až bude Google v Supabase zapnutý).
- Autor nasadil aplikaci na Vercel: https://sciocamp.vercel.app (push do `main` = nasazení).
- Kurzová období (tabulka `blocks`, admin je spravuje ve Správě → „Kurzová období“): 4 za rok, 2 za pololetí. Kurz trvá celé období; ateliér má vlastní od–do uvnitř období (student je v jednu dobu jen v jednom ateliéru — hlídá trigger `guard_one_atelier` i UI); ostatní (expedice) má od–do a volitelně rozvrh. Pomocné funkce v `src/lib/periods.ts`. Proběhlé aktivity jsou na stránkách Kurzy/Ateliéry ve sbaleném seznamu „Proběhlé“.
- Učebny nejsou (výuka je online), místo `activities.location` je nepovinné.
- Datum a čas ve formulářích jen přes `src/components/fields/DateTime.tsx` (dd. mm. rrrr, 24h, kalendář a nabídka časů, volné psaní „1 11“, „1230“) — nativní `<input type="date|time">` se řídí jazykem prohlížeče.
- Vyučující přikládá k úkolům a materiálům soubory (Storage bucket `materialy`, cesta `<id úkolu>/<čas>-<název>`, nahrávání přes `src/lib/upload.ts`). Počet „odevzdalo X z Y“ nezapočítává vrácené práce (`isHandedIn`).
