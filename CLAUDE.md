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
- Přihlášení přes školní Google účet (škola používá Google Workspace).
- Každý předmět, ateliér a událost v rozvrhu má odkaz na Google Meet (vytvářený přes Google Calendar API, přístup pro školní doménu). Vlastní kalendář aplikace, Google Kalendář jen jako volitelná synchronizace.
- Kurzy a ateliéry mají funkce jako Google Classroom: nástěnka, úkoly a materiály podle témat, odevzdávání souborů a Google dokumentů, soukromé komentáře s vyučujícím, týmové úkoly s týmovým chatem, chat třídy, hodnocení s body, kvízy.
- Stack: Next.js (App Router) + TypeScript, Supabase (Postgres, auth, realtime, storage), hosting Vercel.

## Etapy

1. Přihlášení, role, kurzy, rozvrh a Meet (zatím na ukázkových datech, pak Supabase)
2. Úkoly, odevzdávání a hodnocení
3. Chaty, nástěnka a notifikace
4. Zápisy, hlasování a návrhy
