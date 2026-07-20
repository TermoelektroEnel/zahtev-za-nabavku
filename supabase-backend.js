/**
 * SUPABASE BACKEND (zamena za github-backend.js)
 * ----------------------------------------------
 * Presreće iste fetch() pozive ka starom SCRIPT_URL-u (Google Apps Script)
 * i preusmerava ih na Supabase (Auth + Postgres + RLS).
 *
 * index.html i admin.html i dalje pozivaju fetch(SCRIPT_URL, {action}) —
 * ovaj sloj vraća isti oblik odgovora kao ranije: { ok, json() }.
 *
 * Redosled učitavanja u HTML-u (VAŽNO):
 *   1. @supabase/supabase-js (CDN)   -> definiše window.supabase
 *   2. supabase-config.js            -> definiše SUPABASE_CONFIG
 *   3. supabase-backend.js (ovaj)    -> pravi klijent + presretač
 *   4. glavni <script> u stranici
 *
 * Bezbednost: pravu zaštitu obezbeđuju RLS pravila u bazi (schema.sql).
 * Anon ključ je javan; bez validne prijave (JWT) RLS ne dozvoljava pristup.
 */
(function () {
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('supabase-js nije učitan pre supabase-backend.js');
    return;
  }
  if (typeof SUPABASE_CONFIG === 'undefined') {
    console.error('SUPABASE_CONFIG nije definisan (supabase-config.js mora ići pre ovog fajla).');
    return;
  }

  const sbClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  window.sbClient = sbClient;

  const GAS_MATCH = 'script.google.com/macros/';

  /* ---- Username <-> email mapiranje ---- */
  function usernameToEmail_(u) {
    return String(u).trim().toLowerCase() + '@' + SUPABASE_CONFIG.emailDomain;
  }
  function emailToUsername_(e) {
    return String(e || '').split('@')[0];
  }

  /* ---- gradiliste_raw <-> JS (ista semantika kao stari data.json) ---- */
  function parseGradiliste_(raw) {
    const v = String(raw || '').trim();
    if (v === 'SVA') return null;
    if (v === '') return [];
    return v.split(',').map(s => s.trim()).filter(Boolean);
  }
  function serializeGradiliste_(g) {
    if (g === null || g === 'SVA') return 'SVA';
    if (!Array.isArray(g) || g.length === 0) return '';
    return g.join(',');
  }

  /* ---- Mapiranje reda baze -> oblik koji frontend očekuje ---- */
  function mapRequest_(r) {
    return {
      id: r.id,
      redniBroj: r.redni_broj,
      gradiliste: r.gradiliste,
      godina: r.godina,
      nalog: r.nalog,
      stavke: r.stavke,
      createdBy: r.created_by,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      status: r.status || 'u_izradi',
      approvalStep: r.approval_step || 0,
      lastReturnComment: r.last_return_comment || null
    };
  }

  function mapPonuda_(p) {
    return {
      id: p.id,
      brojIzvestaja: p.broj_izvestaja,
      requestId: p.request_id,
      vrstaRadova: p.vrsta_radova,
      adresaIsporuke: p.adresa_isporuke,
      kursEur: p.kurs_eur,
      avans: p.avans,
      nacinPlacanja: p.nacin_placanja,
      garancijaZaPlacanje: p.garancija_za_placanje,
      stavke: p.stavke,
      status: p.status,
      createdAt: p.created_at ? new Date(p.created_at).getTime() : Date.now(),
      updatedAt: p.updated_at ? new Date(p.updated_at).getTime() : Date.now()
    };
  }

  /* ============================================================
     AUTH
     ============================================================ */
  async function checkLogin_(body) {
    const username = (body.username || '').trim();
    const password = body.password || '';
    if (!username || !password) return { error: 'Korisničko ime i lozinka su obavezni.' };
    const { data, error } = await sbClient.auth.signInWithPassword({
      email: usernameToEmail_(username),
      password
    });
    if (error || !data || !data.session) return { error: 'Pogrešno korisničko ime ili lozinka.' };
    return { ok: true, username };
  }

  /* ============================================================
     GET akcije (čitanje)
     ============================================================ */
  async function doGet_(params) {
    const action = params.action;

    if (action === 'list') {
      const { data, error } = await sbClient.from('requests').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      const creatorIds = [...new Set(data.map(r => r.created_by).filter(Boolean))];
      let creatorNames = {};
      if (creatorIds.length) {
        const { data: profs } = await sbClient.from('profiles_public').select('id, username').in('id', creatorIds);
        if (profs) profs.forEach(p => { creatorNames[p.id] = p.username; });
      }
      return { requests: data.map(r => ({ ...mapRequest_(r), createdByUsername: r.created_by ? (creatorNames[r.created_by] || null) : null })) };
    }
    if (action === 'peek') {
      const g = params.gradiliste;
      if (!g) return { error: 'Nedostaje oznaka gradilišta.' };
      const { data, error } = await sbClient.rpc('peek_next', { p_gradiliste: String(g) });
      if (error) throw error;
      return { next: data };
    }
    if (action === 'listGradilista') {
      const { data, error } = await sbClient.from('gradilista').select('*').order('kod');
      if (error) throw error;
      return { gradilista: data.map(r => ({ kod: r.kod, naziv: r.naziv })) };
    }
    if (action === 'listNalozi') {
      const { data, error } = await sbClient.from('nalozi').select('*').order('kod');
      if (error) throw error;
      return { nalozi: data.map(r => ({ kod: r.kod, opis: r.opis, gradiliste: parseGradiliste_(r.gradiliste_raw) })) };
    }
    if (action === 'listPonude') {
      const { data, error } = await sbClient.from('ponude_izvestaji').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return { ponude: data.map(mapPonuda_) };
    }
    if (action === 'listAdrese') {
      const { data, error } = await sbClient.from('adrese_isporuke').select('*').order('naziv');
      if (error) throw error;
      return { adrese: data.map(r => ({ naziv: r.naziv, adresa: r.adresa })) };
    }
    if (action === 'listApprovalRoles') {
      const { data, error } = await sbClient.from('approval_roles').select('*').order('step');
      if (error) throw error;
      const userIds = data.map(r => r.user_id).filter(Boolean);
      let usernames = {};
      if (userIds.length) {
        const { data: profs } = await sbClient.from('profiles_public').select('id, username').in('id', userIds);
        if (profs) profs.forEach(p => { usernames[p.id] = p.username; });
      }
      return {
        roles: data.map(r => ({
          step: r.step,
          nazivUloge: r.naziv_uloge,
          userId: r.user_id,
          username: r.user_id ? (usernames[r.user_id] || null) : null
        }))
      };
    }
    if (action === 'listApprovalLog') {
      const requestId = params.requestId;
      if (!requestId) return { error: 'Nedostaje ID zahteva.' };
      const { data, error } = await sbClient.from('request_approval_log')
        .select('*').eq('request_id', requestId).order('created_at', { ascending: true });
      if (error) throw error;
      const actorIds = [...new Set(data.map(r => r.actor_id).filter(Boolean))];
      let usernames = {};
      if (actorIds.length) {
        const { data: profs } = await sbClient.from('profiles_public').select('id, username').in('id', actorIds);
        if (profs) profs.forEach(p => { usernames[p.id] = p.username; });
      }
      return {
        log: data.map(r => ({
          step: r.step,
          action: r.action,
          actorUsername: r.actor_id ? (usernames[r.actor_id] || null) : null,
          komentar: r.komentar,
          createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now()
        }))
      };
    }
    return { error: 'Nepoznata akcija.' };
  }

  /* ============================================================
     POST akcije (upis)
     ============================================================ */
  async function doPost_(body) {
    switch (body.action) {
      case 'checkLogin': return checkLogin_(body);
      case 'add': return addRequest_(body);
      case 'update': return updateRequest_(body);
      case 'delete': return deleteRequest_(body);
      case 'addGradiliste': return addGradiliste_(body);
      case 'updateGradiliste': return updateGradiliste_(body);
      case 'deleteGradiliste': return deleteGradiliste_(body);
      case 'addNalog': return addNalog_(body);
      case 'updateNalog': return updateNalog_(body);
      case 'deleteNalog': return deleteNalog_(body);
      case 'addPonuda': return addPonuda_(body);
      case 'updatePonuda': return updatePonuda_(body);
      case 'deletePonuda': return deletePonuda_(body);
      case 'addAdresa': return addAdresa_(body);
      case 'updateAdresa': return updateAdresa_(body);
      case 'deleteAdresa': return deleteAdresa_(body);
      case 'posaljiNaOveru': return posaljiNaOveru_(body);
      case 'overiZahtev': return overiZahtev_(body);
      case 'vratiNaDoradu': return vratiNaDoradu_(body);
      case 'updateApprovalRole': return updateApprovalRole_(body);
      default: return { error: 'Nepoznata akcija.' };
    }
  }

  /* ---- Zahtevi ---- */
  async function addRequest_(body) {
    const g = parseInt(body.gradiliste, 10);
    if (!g || g < 901 || g > 999) return { error: 'Neispravna oznaka gradilišta.' };
    const nalogValid = /^\d+(\/\d+)*$/.test(body.nalog || '') || body.nalog === 'SOPSTVENE' || body.nalog === 'TEST'; // TEST = privremeni izuzetak za testiranje, ukloniti kasnije
    if (!nalogValid) return { error: 'Neispravan format naloga za realizaciju.' };
    if (!Array.isArray(body.stavke) || body.stavke.length === 0) return { error: 'Specifikacija je prazna.' };
    const broj = body.broj ? parseInt(body.broj, 10) : null;
    if (broj !== null && (!Number.isInteger(broj) || broj < 1)) return { error: 'Redni broj mora biti pozitivan ceo broj.' };

    const { data, error } = await sbClient.rpc('add_request', {
      p_gradiliste: String(g),
      p_godina: String(body.godina),
      p_nalog: body.nalog,
      p_stavke: body.stavke,
      p_broj: broj
    });
    if (error) return { error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    return { request: mapRequest_(row) };
  }

  async function updateRequest_(body) {
    const nalogValid = /^\d+(\/\d+)*$/.test(body.nalog || '') || body.nalog === 'SOPSTVENE' || body.nalog === 'TEST'; // TEST = privremeni izuzetak za testiranje, ukloniti kasnije
    if (!nalogValid) return { error: 'Neispravan format naloga za realizaciju.' };
    if (!Array.isArray(body.stavke) || body.stavke.length === 0) return { error: 'Specifikacija je prazna.' };
    const { data, error } = await sbClient.from('requests')
      .update({ nalog: body.nalog, stavke: body.stavke })
      .eq('id', body.id).select().maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: 'Zahtev nije pronađen.' };
    return { request: mapRequest_(data) };
  }

  async function deleteRequest_(body) {
    const { error } = await sbClient.from('requests').delete().eq('id', body.id);
    if (error) return { error: error.message };
    return { ok: true };
  }

  /* ---- Gradilišta ---- */
  async function addGradiliste_(body) {
    const kod = parseInt(body.kod, 10);
    if (!kod || kod < 901 || kod > 999) return { error: 'Oznaka gradilišta mora biti broj od 901 do 999.' };
    const naziv = (body.naziv || '').trim();
    if (!naziv) return { error: 'Naziv gradilišta je obavezan.' };
    const { error } = await sbClient.from('gradilista').insert({ kod: String(kod), naziv });
    if (error) return { error: error.code === '23505' ? 'Gradilište sa tom oznakom već postoji.' : error.message };
    return { gradiliste: { kod: String(kod), naziv } };
  }

  async function updateGradiliste_(body) {
    const naziv = (body.naziv || '').trim();
    if (!naziv) return { error: 'Naziv gradilišta je obavezan.' };
    const { data, error } = await sbClient.from('gradilista')
      .update({ naziv }).eq('kod', String(body.kod)).select().maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: 'Gradilište nije pronađeno.' };
    return { gradiliste: { kod: String(body.kod), naziv } };
  }

  async function deleteGradiliste_(body) {
    const { error } = await sbClient.from('gradilista').delete().eq('kod', String(body.kod));
    if (error) return { error: error.message };
    return { ok: true };
  }

  /* ---- Nalozi ---- */
  async function addNalog_(body) {
    const kod = (body.kod || '').trim();
    if (!kod) return { error: 'Kod naloga je obavezan.' };
    const kodValid = /^\d+(\/\d+)*$/.test(kod) || kod === 'SOPSTVENE' || kod === 'TEST'; // TEST = privremeni izuzetak za testiranje, ukloniti kasnije
    if (!kodValid) return { error: 'Kod naloga mora biti niz brojeva odvojenih kosom crtom (npr. 720/26/011) ili "SOPSTVENE".' };
    const opis = (body.opis || '').trim();
    const raw = serializeGradiliste_(body.gradiliste);
    const { error } = await sbClient.from('nalozi').insert({ kod, opis, gradiliste_raw: raw });
    if (error) return { error: error.code === '23505' ? 'Nalog sa tim kodom već postoji.' : error.message };
    return { nalog: { kod, opis, gradiliste: parseGradiliste_(raw) } };
  }

  async function updateNalog_(body) {
    const opis = (body.opis || '').trim();
    const raw = serializeGradiliste_(body.gradiliste);
    const { data, error } = await sbClient.from('nalozi')
      .update({ opis, gradiliste_raw: raw }).eq('kod', String(body.kod)).select().maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: 'Nalog nije pronađen.' };
    return { nalog: { kod: body.kod, opis, gradiliste: parseGradiliste_(raw) } };
  }

  async function deleteNalog_(body) {
    const { error } = await sbClient.from('nalozi').delete().eq('kod', String(body.kod));
    if (error) return { error: error.message };
    return { ok: true };
  }

  /* ---- Ponude (izveštaji o prispelim ponudama) ---- */
  async function addPonuda_(body) {
    if (!body.requestId) return { error: 'Nedostaje zahtev za nabavku.' };
    const { data, error } = await sbClient.rpc('add_ponuda_izvestaj', {
      p_request_id: body.requestId,
      p_vrsta_radova: body.vrstaRadova || '',
      p_adresa_isporuke: body.adresaIsporuke || '',
      p_kurs_eur: body.kursEur ?? null,
      p_avans: body.avans || '',
      p_nacin_placanja: body.nacinPlacanja || '',
      p_garancija_za_placanje: body.garancijaZaPlacanje || '',
      p_stavke: body.stavke || []
    });
    if (error) return { error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    return { ponuda: mapPonuda_(row) };
  }

  async function updatePonuda_(body) {
    const patch = {
      vrsta_radova: body.vrstaRadova ?? '',
      adresa_isporuke: body.adresaIsporuke ?? '',
      kurs_eur: body.kursEur ?? null,
      avans: body.avans ?? '',
      nacin_placanja: body.nacinPlacanja ?? '',
      garancija_za_placanje: body.garancijaZaPlacanje ?? '',
      stavke: body.stavke ?? [],
      status: body.status || 'u_izradi',
      updated_at: new Date().toISOString()
    };
    const { data, error } = await sbClient.from('ponude_izvestaji')
      .update(patch).eq('id', body.id).select().maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: 'Izveštaj nije pronađen.' };
    return { ponuda: mapPonuda_(data) };
  }

  async function deletePonuda_(body) {
    const { error } = await sbClient.from('ponude_izvestaji').delete().eq('id', body.id);
    if (error) return { error: error.message };
    return { ok: true };
  }

  /* ---- Adrese isporuke ---- */
  async function addAdresa_(body) {
    const naziv = (body.naziv || '').trim();
    if (!naziv) return { error: 'Naziv je obavezan.' };
    const adresa = (body.adresa || '').trim();
    const { error } = await sbClient.from('adrese_isporuke').insert({ naziv, adresa });
    if (error) return { error: error.code === '23505' ? 'Adresa sa tim nazivom već postoji.' : error.message };
    return { adresaObj: { naziv, adresa } };
  }

  async function updateAdresa_(body) {
    const adresa = (body.adresa || '').trim();
    const { data, error } = await sbClient.from('adrese_isporuke')
      .update({ adresa }).eq('naziv', String(body.naziv)).select().maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: 'Adresa nije pronađena.' };
    return { adresaObj: { naziv: body.naziv, adresa } };
  }

  async function deleteAdresa_(body) {
    const { error } = await sbClient.from('adrese_isporuke').delete().eq('naziv', String(body.naziv));
    if (error) return { error: error.message };
    return { ok: true };
  }

  /* ---- Lanac odobravanja zahteva ---- */
  async function posaljiNaOveru_(body) {
    const { error } = await sbClient.rpc('posalji_na_overu', { p_request_id: body.id });
    if (error) return { error: error.message };
    return { ok: true };
  }

  async function overiZahtev_(body) {
    const { error } = await sbClient.rpc('overi_zahtev', {
      p_request_id: body.id,
      p_stavke: body.stavke || null,
      p_komentar: body.komentar || null
    });
    if (error) return { error: error.message };
    return { ok: true };
  }

  async function vratiNaDoradu_(body) {
    const { error } = await sbClient.rpc('vrati_na_doradu', {
      p_request_id: body.id,
      p_komentar: body.komentar || '',
      p_stavke: body.stavke || null
    });
    if (error) return { error: error.message };
    return { ok: true };
  }

  async function updateApprovalRole_(body) {
    const step = Number(body.step);
    if (!step || step < 1 || step > 4) return { error: 'Nepoznat korak.' };
    const { error } = await sbClient.from('approval_roles')
      .update({ user_id: body.userId || null }).eq('step', step);
    if (error) return { error: error.message };
    return { ok: true };
  }

  /* ============================================================
     PRESRETANJE fetch() POZIVA KA STAROM SCRIPT_URL-U
     ============================================================ */
  const _origFetch = window.fetch.bind(window);
  window.fetch = async function (url, opts) {
    if (typeof url === 'string' && url.indexOf(GAS_MATCH) !== -1) {
      try {
        let result;
        if (opts && opts.method === 'POST') {
          result = await doPost_(JSON.parse(opts.body));
        } else {
          const qi = url.indexOf('?');
          const params = {};
          if (qi !== -1) new URLSearchParams(url.slice(qi + 1)).forEach((v, k) => { params[k] = v; });
          result = await doGet_(params);
        }
        return { ok: true, json: async () => result };
      } catch (err) {
        console.error('Supabase backend greška:', err);
        return { ok: true, json: async () => ({ error: String(err.message || err) }) };
      }
    }
    return _origFetch(url, opts);
  };

  /* ============================================================
     POMOĆNI HELPERI ZA STRANICE (auth)
     ============================================================ */
  window.ZN = {
    usernameToEmail: usernameToEmail_,
    emailToUsername: emailToUsername_,
    async currentUsername() {
      const { data } = await sbClient.auth.getSession();
      return data.session ? emailToUsername_(data.session.user.email) : null;
    },
    async currentUserId() {
      const { data } = await sbClient.auth.getSession();
      return data.session ? data.session.user.id : null;
    },
    async isAdmin() {
      const { data, error } = await sbClient.rpc('is_admin');
      return !error && !!data;
    },
    // null = sva gradilišta, [] = nijedno, ['901','902',...] = dodeljena lista
    async myGradilista() {
      const { data: sessionData } = await sbClient.auth.getSession();
      if (!sessionData.session) return null;
      const { data, error } = await sbClient
        .from('profiles')
        .select('gradilista_raw')
        .eq('id', sessionData.session.user.id)
        .maybeSingle();
      if (error || !data) return null; // fail-open: ne blokiraj ako nešto pođe po zlu
      return parseGradiliste_(data.gradilista_raw);
    },
    async signOut() {
      try { await sbClient.auth.signOut(); } catch (e) { /* ignore */ }
    }
  };
})();
