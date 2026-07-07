-- ============================================================
--  ZAHTEV ZA NABAVKU — Supabase schema, RLS i funkcije
--  Pokreni JEDNOM u Supabase Dashboard -> SQL Editor -> New query.
--  Bezbedno je pokrenuti ponovo (idempotentno gde je moguće).
-- ============================================================

-- ------------------------------------------------------------
--  1) TABELE
-- ------------------------------------------------------------

-- Profil po korisniku (mapira auth.users -> username + role)
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null,
  role       text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- Gradilišta
create table if not exists public.gradilista (
  kod   text primary key,
  naziv text not null
);

-- Nalozi za realizaciju
-- gradiliste_raw čuva istu semantiku kao stari data.json:
--   'SVA'  -> važi za sva gradilišta (u JS -> null)
--   ''     -> ni za jedno (u JS -> [])
--   'a,b'  -> lista kodova
create table if not exists public.nalozi (
  kod           text primary key,
  opis          text not null default '',
  gradiliste_raw text not null default ''
);

-- Brojači rednih brojeva po gradilištu (nikad se ne recikliraju)
create table if not exists public.counters (
  gradiliste text primary key,
  last       integer not null default 0
);

-- Zahtevi
create table if not exists public.requests (
  id         uuid primary key default gen_random_uuid(),
  redni_broj text not null unique,
  gradiliste text not null,
  godina     text not null,
  nalog      text not null,
  stavke     jsonb not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
--  2) is_admin() — provera da li je trenutni korisnik admin
--     SECURITY DEFINER da izbegne rekurziju u RLS na profiles
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ------------------------------------------------------------
--  3) Auto-kreiranje profila kad se doda auth korisnik
--     username = deo emaila pre '@'
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    'user'  -- uvek 'user'; admin se dodeljuje isključivo ručno u tabeli profiles (nikad iz metapodataka)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
--  4) RLS
-- ------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.gradilista enable row level security;
alter table public.nalozi     enable row level security;
alter table public.counters   enable row level security;
alter table public.requests   enable row level security;

-- profiles: korisnik vidi svoj profil; admin vidi sve
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- gradilišta: svi prijavljeni čitaju; samo admin menja
drop policy if exists gradilista_select on public.gradilista;
create policy gradilista_select on public.gradilista
  for select to authenticated using (true);
drop policy if exists gradilista_write on public.gradilista;
create policy gradilista_write on public.gradilista
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- nalozi: svi prijavljeni čitaju; samo admin menja
drop policy if exists nalozi_select on public.nalozi;
create policy nalozi_select on public.nalozi
  for select to authenticated using (true);
drop policy if exists nalozi_write on public.nalozi;
create policy nalozi_write on public.nalozi
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- counters: svi prijavljeni čitaju (peek); upis ide preko RPC funkcije
drop policy if exists counters_select on public.counters;
create policy counters_select on public.counters
  for select to authenticated using (true);

-- requests: svi prijavljeni čitaju; upis/izmena/brisanje za prijavljene
drop policy if exists requests_select on public.requests;
create policy requests_select on public.requests
  for select to authenticated using (true);
drop policy if exists requests_update on public.requests;
create policy requests_update on public.requests
  for update to authenticated using (true) with check (true);
drop policy if exists requests_delete on public.requests;
create policy requests_delete on public.requests
  for delete to authenticated using (true);
-- insert ide preko add_request() RPC-a (atomično sa brojačem)

-- ------------------------------------------------------------
--  5) peek_next(gradiliste) -> sledeći slobodan redni broj
-- ------------------------------------------------------------
create or replace function public.peek_next(p_gradiliste text)
returns integer
language sql
security invoker
set search_path = public
as $$
  select coalesce((select last from public.counters where gradiliste = p_gradiliste), 0) + 1;
$$;

-- ------------------------------------------------------------
--  6) add_request(...) -> atomično: brojač + umetanje zahteva
--     p_broj = NULL znači "sledeći automatski"
-- ------------------------------------------------------------
create or replace function public.add_request(
  p_gradiliste text,
  p_godina     text,
  p_nalog      text,
  p_stavke     jsonb,
  p_broj       integer default null
)
returns public.requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last integer;
  v_next integer;
  v_redni text;
  v_row public.requests;
begin
  -- zaključaj/kreiraj red brojača za ovo gradilište
  insert into public.counters (gradiliste, last)
  values (p_gradiliste, 0)
  on conflict (gradiliste) do nothing;

  select last into v_last from public.counters
  where gradiliste = p_gradiliste
  for update;

  if p_broj is not null then
    if p_broj < 1 then
      raise exception 'Redni broj mora biti pozitivan ceo broj.';
    end if;
    v_next := p_broj;
    v_redni := p_gradiliste || '/' || p_godina || '/' || lpad(v_next::text, 3, '0');
    if exists (select 1 from public.requests where redni_broj = v_redni) then
      raise exception 'Taj redni broj je već zauzet za ovo gradilište. Izaberi drugi.';
    end if;
    if v_next > v_last then
      update public.counters set last = v_next where gradiliste = p_gradiliste;
    end if;
  else
    v_next := v_last + 1;
    v_redni := p_gradiliste || '/' || p_godina || '/' || lpad(v_next::text, 3, '0');
    update public.counters set last = v_next where gradiliste = p_gradiliste;
  end if;

  insert into public.requests (redni_broj, gradiliste, godina, nalog, stavke)
  values (v_redni, p_gradiliste, p_godina, p_nalog, p_stavke)
  returning * into v_row;

  return v_row;
end;
$$;

-- add_request je jedini (kontrolisani) put za upis u counters i requests.
-- Radi kao SECURITY DEFINER da bi mogao da piše u counters (koji ima RLS
-- bez INSERT/UPDATE politike). Izvršavanje je dozvoljeno samo prijavljenim
-- korisnicima — anon (neprijavljeni) ne sme da ga poziva.
revoke all on function public.add_request(text, text, text, jsonb, integer) from public, anon;
grant execute on function public.add_request(text, text, text, jsonb, integer) to authenticated;

-- ------------------------------------------------------------
--  7) POČETNI PODACI (gradilišta + nalozi)
-- ------------------------------------------------------------
insert into public.gradilista (kod, naziv) values
  ('901','DIREKCIJA'), ('902','OBRENOVAC'), ('907','KOSTOLAC'),
  ('908','MORAVA SVILAJNAC'), ('909','LABORATORIJA'), ('910','Beograd'),
  ('911','PANČEVO'), ('913','PODGORICA'), ('914','OBRENOVAC - Odsumporavanje'),
  ('915','Projektovanje'), ('919','KOSTOLAC - NIŠ - materijal'), ('924','EXPO'),
  ('925','NOVI SAD'), ('927','KOLUBARA A'), ('928','KOLUBARA B'),
  ('932','CENTRALNI MAGACIN')
on conflict (kod) do nothing;

insert into public.nalozi (kod, opis, gradiliste_raw) values
  ('720/25/001','TENT A-Usluga elektroodržavanja',''),
  ('720/25/002','TE Kostolac A2- Rekonstrukcija ventilskih kasetnih podrazvoda','907'),
  ('720/25/003','TENT A- Isporuka i zamena 6 kV kablova (A3, A4, A6)','902'),
  ('720/25/004','TE Kostolac B2 - EII - Čišćenje sabirnica','907'),
  ('720/25/005','TENT A - ODG Održavanje','902'),
  ('720/25/006','Comita - Skladište Niš - Premeštanje ESD ormana','919'),
  ('720/25/007','MTN - RNP Železnica - Polaganje PP Kablova po nadstrešnici','911'),
  ('720/25/008','Comita - Skladiste Nis- Izrada dokumentacije sa rasporedom kablova na nadzemnim i podzemnim trasama','919'),
  ('720/25/009','N2K Proces inzenjering - Vreoci - kabliranje','927'),
  ('720/25/010','Siemens Energy - EXPO Trigenerativno postrojenje instumentacija','924'),
  ('720/25/011','TE Kolubara -Odrzavanje 110,35 i 6 kV postrojenja','927'),
  ('720/25/012','IvDam - J245 vodeno ispiranje hladnjaka S4300','911'),
  ('720/26/001','TENT A - Redovno održavanje kablova i kablovskih trasa','902'),
  ('720/26/002','Tehnički servisi - Elektroenergetski radovi na zameni pumpe GA -103','911'),
  ('720/26/003','TENT A - Energetski kablovi pobudnog sistema generatora A1 i A2','902'),
  ('720/26/004','IMP - TE Kostolac A - Proširenje postrojenja za pepeo i šljaku','907'),
  ('720/26/005','TENT A - Usluge elektroodržavanja','902'),
  ('720/26/006','POWER CHINA - Napajanje TCF za BG metro','919'),
  ('720/26/007','TENT B - Remontno održavanje MRU','902'),
  ('720/26/008','NIS Rezervoari R6, R7 Novi Sad','925'),
  ('720/26/009','HIP Petrohemija - SN kablovi za PEVG, NN kablovi PENG','911'),
  ('720/26/010','TE-KO A-Rekonstrukcija klapni na A2','919'),
  ('SOPSTVENE','','SVA')
on conflict (kod) do nothing;
