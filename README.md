# ScioCamp

Školní systém pro ScioCamp: rozvrh, kurzy, ateliéry ve stylu Google Classroomu, úkoly, hlasování a zprávy. Next.js (App Router) + TypeScript, později Supabase a Vercel.

## Spuštění

```bash
npm install
npm run dev
```

Aplikace běží na http://localhost:3000. Bez nastavení běží v ukázkovém režimu. Napojení na Supabase popisuje [docs/supabase-nastaveni.md](docs/supabase-nastaveni.md); proměnné prostředí jsou v `.env.example`.

Testy oprávnění v databázi: `npm run test:db`.

## Ukázkový režim (etapa 1)

Data jsou zatím ukázková (`src/lib/demo-data.ts`). Na přihlašovací stránce tlačítko „Pokračovat přes Google“ nabídne tři ukázkové účty:

| Účet | Role |
| --- | --- |
| Šimon Samuel Liška | student |
| Anežka Jakubcová | učitelka |
| Miroslav Pavel | admin |

Přihlásit se dá i e-mailem kohokoli z ukázkových dat (heslo se zatím nekontroluje).

## Struktura

- `src/app/prihlaseni` — přihlášení
- `src/app/(app)` — stránky za přihlášením: Domov (rozvrh), Kurzy, Ateliéry, detail třídy, Moje třídy (učitel), Správa (admin), Profil
- `src/lib/data.ts` — jediný přístup k datům; při napojení Supabase se mění jen tady
- `src/lib/auth.ts`, `src/lib/session.ts`, `src/proxy.ts` — session a kontrola rolí
- `design/` — schválený návrh UI
