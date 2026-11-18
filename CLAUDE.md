# CLAUDE.md — Zahtev za nabavku (Termoelektro Enel AD)

Uputstvo za Claude-a koji nastavlja rad na ovom projektu, na bilo kom računaru (PC ili Mac). Ovde su pravila rada i kontekst koji se ne vidi iz koda.

## Šta je projekat

Statička web aplikacija (HTML/CSS/JS, bez build koraka) za nabavku, hostovana na GitHub Pages iz repozitorijuma `TermoelektroEnel/zahtev-za-nabavku` (grana `main`). Push na `main` je u aplikaciji za minut-dva. Podaci su u Supabase-u.

Stranice:
- `pocetna.html` — uvodna stranica.
- `index.html` — Zahtev za nabavku: unos zahteva, lanac overe, Zbirna specifikacija po nalogu, upiti dobavljačima (.eml mejl i Word).
- `ponude.html` — Izveštaji o ponudama: novi izveštaj, dopunski izveštaj (`IP-…-D1`), overa, „Poručeno“, Izveštaj o završenim nabavkama (Excel po nalogu).
- `admin.html` — administracija (korisnici, gradilišta, nalozi, lanac overe).

Zajednički fajlovi: `supabase-backend.js` (sav pristup bazi), `supabase-config.js`, `zbirna.js` (Zbirna specifikacija, koristi se i u `index.html` i u `ponude.html`), `tema.css` (svetla tema, `index.html` i `admin.html`), `tamna.css` (tamni mod, `pocetna.html` i `ponude.html`), `logo.jpg`.
`predlozi-*.html` su stare probne stranice sa varijantama izgleda, nisu deo aplikacije.

## Baza (Supabase)

- Projekat `zahtev-za-nabavku`, ref `yalsccrxelnswxdekzsf`. Isti projekat koristi i aplikacija BZR evidencije (šema `bzr`), pa se ništa van ove aplikacije ne dira.
- Glavne tabele (šema `public`): `requests`, `nalozi`, `gradilista`, `profiles`, `approval_roles`, `request_approval_log`, `ponude_izvestaji`, `ponuda_approval_log`, `upiti`, `potpisi`, `adrese_isporuke`. Logika overe je u RPC funkcijama (`add_request`, `posalji_na_overu`, `overi_zahtev`, `add_ponuda_izvestaj`, `add_dopunski_izvestaj`, `overi_ponudu`, `postavi_porucen_ponuda`, `get_porucene_ponude` …).
- `supabase/schema.sql` je samo početna šema; kasnije izmene su pokretane ručno u SQL editoru. Pre pisanja SQL-a proveri stvarno stanje baze (Supabase konektor).
- Mejlovi se šalju preko Edge Function-a i servisa Resend; korisnici se upravljaju kroz Edge Function `supabase/functions/manage-users`.

## Uloge

Korisnik koji radi sa Claude-om je **Rukovodilac nabavke** (i administrator). On dobija mejl čim podnosilac pošalje zahtev na overu, kako bi slao upite dobavljačima dok zahtev još prolazi lanac overe.

## Pravila rada (od korisnika)

- Pre svakog posla: `git pull`, jer se radi i na PC-u i na Mac-u.
- Svaka izmena se prvo proverava na localhost-u. Na PC-u: preview `zahtev-lokalno` iz `.claude/launch.json` (http://localhost:8080). Korisnik u browseru radi Ctrl+F5.
- Kod predloga izgleda: napravi nekoliko varijanti na localhost-u, korisnik bira.
- Push tek kad korisnik napiše „Pushuj“. Posle push-a: „Ugasi ga“ znači ugasi lokalni server.
- Ne briši i ne menjaj postojeće podatke u bazi; SQL prvo pokaži korisniku. Pre izmene baze proveri da ne utiče na BZR (šema `bzr`).
- Interne oznake (npr. „Broj poz. spec.“) ne idu u mejlove i dokumente za dobavljače.
- Korisnik piše na srpskom (latinica). Odgovaraj na srpskom.

## Istorija (ukratko)

- 10/2026: uklonjen „Broj poz. spec.“ iz upita, mejl upita kao .eml sa potpisom, novi izgled (Enel plava), lista izveštaja grupisana po gradilištu i nalogu.
- 15.10.: upiti dobavljačima dok je zahtev na overi + evidencija upita (više dobavljača).
- 27.10.: dopunski izveštaj o ponudama (`-D1`), prazne pozicije se izbacuju pri slanju na overu.
- 29.10.: ispravka otvaranja PDF priloga za Rukovodioca nabavke.
- 2.–5.11.: izmena količine u izveštaju, datum zahteva pored broja, kolona „Napomena“ i status „ne poručuje se“ (zelen red) u Zbirnoj specifikaciji.
- 9.11.: Izveštaj o završenim nabavkama (Excel po nalogu, samo poručeni izveštaji, cena izabranog dobavljača posle rabata).
- 11.11. (Mac): redizajn — tamni mod, uvodna stranica, nova stranica Izveštaji o ponudama (lista levo, tabovi, filter po nalogu).
- 18.11.: Zbirna specifikacija — upis posle jednog klika (posle čuvanja polja osvežava se samo taj red, ne cela tabela; ne vraćati `render()` u `onFieldChange`). Tabela u visini prozora sa skrolom unutar kartice: horizontalni skrol bar uvek na dnu, zaglavlje i filteri lepljivi na vrhu.
- Stara probna verzija sa podacima na GitHub-u sačuvana je kao tag `arhiva/branch-sa-baza-na-github`.

## Budućnost

Aplikacija će jednog dana postati modul Nabavka u Portalu (`TermoelektroEnel/portal`, vidi `PLAN-PORTAL.md` tamo). Do tada ostaje samostalna i mora da radi kao i do sada.
