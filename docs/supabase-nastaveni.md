# Napojení na Supabase — krok za krokem

Bez Supabase běží aplikace v ukázkovém režimu. Po těchto krocích poběží naostro: skuteční uživatelé, hesla, oprávnění a data v databázi.

## 1. Projekt

1. Na [supabase.com](https://supabase.com) se přihlas a dej **New project**.
2. **Region: Central EU (Frankfurt)** — data studentů zůstanou v EU.
3. Heslo k databázi si ulož do správce hesel (aplikace ho nepotřebuje).

## 2. Databáze

1. V projektu otevři **SQL Editor → New query**.
2. Vlož celý obsah souboru `supabase/migrations/20261018200000_zaklad.sql` a dej **Run**.
3. Mělo by skončit hláškou *Success. No rows returned*.

Další migrace (v dalších etapách) se spouští stejně, vždy v pořadí podle názvu souboru.

## 3. Přihlašování

**Authentication → Sign In / Providers**

- **Email**: zapnuto. **Confirm email**: zapnuto. **Minimum password length**: 10.
- **Allow new users to sign up: VYPNOUT.** Účty zakládá jen admin; bez toho by se mohl zaregistrovat kdokoli se školním e-mailem.

**Authentication → URL Configuration**

- **Site URL**: adresa aplikace na Vercelu, např. `https://sciocamp.vercel.app` (dokud ji nemáš, `http://localhost:3000`).
- **Redirect URLs**: přidej `http://localhost:3000/**` a `https://<tvoje-adresa>.vercel.app/**`.

## 4. E-maily

Bez vlastního e-mailového serveru (SMTP) platí v Supabase dvě omezení:

- **Texty e-mailů nejdou upravit.** Aplikace si s výchozími texty poradí: odkaz z pozvánky zpracuje stránka `/auth/prijeti`, odkaz na obnovu hesla `/auth/callback`.
- **E-maily dostanou jen členové týmu projektu** (Organization → Team) a jen pár za hodinu. Pozvánky učitelům a studentům tedy zatím nedorazí.

Pro zkoušení to nevadí: uživatele zakládej v **Authentication → Users → Add user → Create new user** s heslem a zaškrtnutým *Auto Confirm User*.

**Před ostrým spuštěním** nastav vlastní SMTP (**Authentication → Emails → SMTP Settings**), např. zdarma přes Brevo s ověřenou adresou odesílatele. Pak jdou upravit i texty — doporučené české šablony:

**Invite user** — předmět *Pozvánka do ScioCampu*:

```html
<h2>Pozvánka do ScioCampu</h2>
<p>Správce školy ti založil účet. Klikni na odkaz a nastav si heslo:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Nastavit heslo</a></p>
<p>Pak se můžeš přihlašovat školním e-mailem a heslem.</p>
```

**Reset password** — předmět *Nové heslo do ScioCampu*:

```html
<h2>Nastavení hesla</h2>
<p>Někdo (snad ty) požádal o nové heslo do ScioCampu. Pokud ne, e-mail ignoruj.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Nastavit nové heslo</a></p>
```

Odkazy přes `/auth/confirm` fungují i na jiném zařízení, než kde se o e-mail žádalo.

## 5. Klíče do aplikace

**Project Settings → API Keys** (a **Data API** pro URL). Budeš potřebovat:

| Proměnná | Kde ji najdeš | Tajná? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | ne |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_…`) | ne |
| `SUPABASE_SECRET_KEY` | Secret key (`sb_secret_…`) | **ano** |

- **Lokálně**: zkopíruj `.env.example` na `.env.local` a vyplň. Soubor `.env.local` se do gitu nenahrává.
- **Vercel**: Project → Settings → Environment Variables, stejné tři hodnoty. Pak **Redeploy**.

Secret key obchází všechna oprávnění. Nikam ho neposílej (ani do chatu) a nikdy ho necommituj. Kdyby unikl, v Supabase ho jedním klikem vyměníš.

## 6. První admin

1. **Authentication → Users → Add user → Create new user**: tvůj školní e-mail, heslo, zaškrtni *Auto Confirm User*.
2. V **SQL Editoru** spusť (s tvým e-mailem):

   ```sql
   update public.profiles set role = 'admin', full_name = 'Tvoje Jméno'
   where email = 'tvuj.email@scioskola.cz';
   ```

3. Přihlas se do aplikace. Další lidi už přidáváš ve **Správa → Přidat uživatele** — dostanou pozvánku e-mailem.

## 7. Ukázková data (volitelné)

Chceš-li si vyzkoušet aplikaci naostro s ukázkovými kurzy a lidmi, doplň do `.env.local` ještě `SEED_PASSWORD=nejake-dlouhe-heslo` a spusť:

```bash
npm run seed
```

Vytvoří ukázkové uživatele (všichni s heslem ze `SEED_PASSWORD`), kurzy, ateliéry, rozvrh a zápisy. Až bude škola zadávat skutečná data, ukázkové uživatele smažeš v **Authentication → Users**.

## 8. Přihlášení přes Google (až bude čas)

1. V [Google Cloud Console](https://console.cloud.google.com) založ projekt, nastav **OAuth consent screen** (typ *External*, název ScioCamp) a vytvoř **OAuth client ID** typu *Web application*.
2. **Authorized redirect URI**: `https://<id-projektu>.supabase.co/auth/v1/callback` (přesnou adresu ukazuje Supabase u Google providera).
3. Client ID a Client secret vlož v Supabase do **Authentication → Sign In / Providers → Google** a zapni ho.

Učitelé se tak přihlásí hned. **Studentům pod 18 let** Google přihlášení do aplikací třetích stran ve výchozím stavu blokuje, dokud ho správce školního Google Workspace aplikaci nepovolí (Admin console → Security → API controls → App access control). Do té doby se studenti přihlašují e-mailem a heslem — aplikace jim to při chybě sama napíše.

## Ověření oprávnění

Pravidla, kdo co smí, jsou v migraci a mají automatické testy (běží bez Supabase):

```bash
npm run test:db
```
