/**
 * GITHUB BACKEND (zamena za AppsScript.gs)
 * ------------------------------------------
 * Isti princip kao ranije: index.html i admin.html i dalje pozivaju
 * fetch(SCRIPT_URL, ...) kao i do sada - ništa se u njima ne menja.
 * Ovaj fajl presreće te pozive i umesto mreže ka Google-u, čita/piše
 * JEDAN JSON fajl (data.json) u tvom GitHub repo-u preko GitHub API-ja.
 *
 * Svi podaci (zahtevi, gradilišta, nalozi, korisnici, brojači) žive u
 * tom jednom JSON fajlu, kao jedan "commit" po izmeni.
 *
 * VAŽNO: Ovaj fajl mora biti učitan POSLE github-config.js i PRE
 * glavnog <script> bloka u index.html / admin.html.
 */

const GAS_URL = "https://script.google.com/macros/s/AKfycby9zpoac93iRvD7gavKdgKel7XaT_lmDBTfTc42-M0iKo3LIj7MSuVxXN36sTUDpBcU/exec";

const DEFAULT_GRADILISTA = [
  ['901', 'DIREKCIJA'], ['902', 'OBRENOVAC'], ['907', 'KOSTOLAC'],
  ['908', 'MORAVA SVILAJNAC'], ['909', 'LABORATORIJA'], ['910', 'Beograd'],
  ['911', 'PANČEVO'], ['913', 'PODGORICA'], ['914', 'OBRENOVAC - Odsumporavanje'],
  ['915', 'Projektovanje'], ['919', 'KOSTOLAC - NIŠ - materijal'], ['924', 'EXPO'],
  ['925', 'NOVI SAD'], ['927', 'KOLUBARA A'], ['928', 'KOLUBARA B'],
  ['932', 'CENTRALNI MAGACIN']
].map(([kod, naziv]) => ({ kod, naziv }));

const DEFAULT_NALOZI = [
  ['720/25/001', 'TENT A-Usluga elektroodržavanja', ''],
  ['720/25/002', 'TE Kostolac A2- Rekonstrukcija ventilskih kasetnih podrazvoda', '907'],
  ['720/25/003', 'TENT A- Isporuka i zamena 6 kV kablova (A3, A4, A6)', '902'],
  ['720/25/004', 'TE Kostolac B2 - EII - Čišćenje sabirnica', '907'],
  ['720/25/005', 'TENT A - ODG Održavanje', '902'],
  ['720/25/006', 'Comita - Skladište Niš - Premeštanje ESD ormana', '919'],
  ['720/25/007', 'MTN - RNP Železnica - Polaganje PP Kablova po nadstrešnici', '911'],
  ['720/25/008', 'Comita - Skladiste Nis- Izrada dokumentacije sa rasporedom kablova na nadzemnim i podzemnim trasama', '919'],
  ['720/25/009', 'N2K Proces inzenjering - Vreoci - kabliranje', '927'],
  ['720/25/010', 'Siemens Energy - EXPO Trigenerativno postrojenje instumentacija', '924'],
  ['720/25/011', 'TE Kolubara -Odrzavanje 110,35 i 6 kV postrojenja', '927'],
  ['720/25/012', 'IvDam - J245 vodeno ispiranje hladnjaka S4300', '911'],
  ['720/26/001', 'TENT A - Redovno održavanje kablova i kablovskih trasa', '902'],
  ['720/26/002', 'Tehnički servisi - Elektroenergetski radovi na zameni pumpe GA -103', '911'],
  ['720/26/003', 'TENT A - Energetski kablovi pobudnog sistema generatora A1 i A2', '902'],
  ['720/26/004', 'IMP - TE Kostolac A - Proširenje postrojenja za pepeo i šljaku', '907'],
  ['720/26/005', 'TENT A - Usluge elektroodržavanja', '902'],
  ['720/26/006', 'POWER CHINA - Napajanje TCF za BG metro', '919'],
  ['720/26/007', 'TENT B - Remontno održavanje MRU', '902'],
  ['720/26/008', 'NIS Rezervoari R6, R7 Novi Sad', '925'],
  ['720/26/009', 'HIP Petrohemija - SN kablovi za PEVG, NN kablovi PENG', '911'],
  ['720/26/010', 'TE-KO A-Rekonstrukcija klapni na A2', '919'],
  ['SOPSTVENE', '', 'SVA']
].map(([kod, opis, gradiliste]) => ({ kod, opis, gradiliste: gradiliste || '' }));

const DEFAULT_DATA = {
  requests: [],
  counters: {},
  gradilista: DEFAULT_GRADILISTA,
  nalozi: DEFAULT_NALOZI,
  korisnici: [{ username: 'admin', password: 'Nabavka2025' }]
};

function parseGradilistaField_(raw) {
  const val = String(raw || '').trim();
  if (val === 'SVA') return null;
  if (val === '') return [];
  return val.split(',').map(s => s.trim()).filter(Boolean);
}
function serializeGradilistaField_(gradiliste) {
  if (gradiliste === null || gradiliste === 'SVA') return 'SVA';
  if (!Array.isArray(gradiliste) || gradiliste.length === 0) return '';
  return gradiliste.join(',');
}

/* ============================================================
   UTF-8 <-> Base64 (GitHub API zahteva base64 sadržaj fajla)
   ============================================================ */
function utf8ToBase64_(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}
function base64ToUtf8_(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* ============================================================
   GITHUB CONTENTS API - čitanje i pisanje data.json
   ============================================================ */
function ghApiUrl_() {
  return `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`;
}
function ghHeaders_() {
  return {
    'Authorization': `Bearer ${GITHUB_CONFIG.token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

// Vraća { data: {...parsedJSON}, sha } ili null ako fajl ne postoji.
async function ghGetFile_() {
  const res = await _originalFetch(`${ghApiUrl_()}?ref=${GITHUB_CONFIG.branch}&_=${Date.now()}`, {
    headers: ghHeaders_()
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API greška pri čitanju (${res.status}): ${await res.text()}`);
  const json = await res.json();
  const text = base64ToUtf8_(json.content.replace(/\n/g, ''));
  return { data: JSON.parse(text), sha: json.sha };
}

// Piše ceo JSON. sha=null znači "napravi novi fajl".
async function ghPutFile_(dataObj, sha, message) {
  const body = {
    message: message || 'update data.json',
    content: utf8ToBase64_(JSON.stringify(dataObj, null, 2)),
    branch: GITHUB_CONFIG.branch
  };
  if (sha) body.sha = sha;
  const res = await _originalFetch(ghApiUrl_(), {
    method: 'PUT',
    headers: { ...ghHeaders_(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`GitHub API greška pri upisu (${res.status}): ${errText}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  return json.content.sha;
}

async function ensureSeeded_() {
  const file = await ghGetFile_();
  if (file === null) {
    await ghPutFile_(DEFAULT_DATA, null, 'Init data.json');
  }
}

// Read-modify-write sa automatskim ponovnim pokušajem ako neko drugi
// upiše fajl u međuvremenu (GitHub vraća 409/422 kad se sha ne poklapa).
async function withData_(mutatorFn) {
  await ensureSeeded_();
  for (let attempt = 0; attempt < 5; attempt++) {
    const file = await ghGetFile_();
    const dataObj = file.data;
    const outcome = mutatorFn(dataObj); // { value, changed, message }
    if (!outcome.changed) return outcome.value;
    try {
      await ghPutFile_(dataObj, file.sha, outcome.message);
      return outcome.value;
    } catch (err) {
      if ((err.status === 409 || err.status === 422) && attempt < 4) continue;
      throw err;
    }
  }
  throw new Error('Previše pokušaja upisa (neko drugi istovremeno menja podatke). Pokušaj ponovo.');
}

async function readOnly_(readerFn) {
  await ensureSeeded_();
  const file = await ghGetFile_();
  return readerFn(file.data);
}

/* ============================================================
   GET akcije (čitanje)
   ============================================================ */
async function doGetLogic_(params) {
  const action = params.action;

  if (action === 'list') {
    return readOnly_(d => ({ requests: d.requests }));
  }
  if (action === 'peek') {
    const g = params.gradiliste;
    if (!g) return { error: 'Nedostaje oznaka gradilišta.' };
    return readOnly_(d => ({ next: (Number(d.counters[String(g)]) || 0) + 1 }));
  }
  if (action === 'listGradilista') {
    return readOnly_(d => ({ gradilista: d.gradilista }));
  }
  if (action === 'listNalozi') {
    return readOnly_(d => ({
      nalozi: d.nalozi.map(n => ({ kod: n.kod, opis: n.opis, gradiliste: parseGradilistaField_(n.gradiliste) }))
    }));
  }
  if (action === 'listUsers') {
    return readOnly_(d => ({ users: d.korisnici.map(u => ({ username: u.username })) }));
  }
  return { error: 'Nepoznata akcija.' };
}

/* ============================================================
   POST akcije (upis)
   ============================================================ */
async function doPostLogic_(body) {
  const action = body.action;

  if (action === 'add') return addRequest_(body);
  if (action === 'update') return updateRequest_(body);
  if (action === 'delete') return deleteRequest_(body.id);
  if (action === 'addGradiliste') return addGradiliste_(body);
  if (action === 'updateGradiliste') return updateGradiliste_(body);
  if (action === 'deleteGradiliste') return deleteGradiliste_(body);
  if (action === 'addNalog') return addNalogAdmin_(body);
  if (action === 'updateNalog') return updateNalogAdmin_(body);
  if (action === 'deleteNalog') return deleteNalogAdmin_(body);
  if (action === 'checkLogin') return checkLogin_(body);
  if (action === 'addUser') return addUser_(body);
  if (action === 'deleteUser') return deleteUser_(body);
  if (action === 'updateUserPassword') return updateUserPassword_(body);

  return { error: 'Nepoznata akcija.' };
}

/* ---- Zahtevi ---- */
function addRequest_(body) {
  const g = parseInt(body.gradiliste, 10);
  if (!g || g < 901 || g > 999) return Promise.resolve({ error: 'Neispravna oznaka gradilišta.' });
  const nalogValid = /^\d+(\/\d+)*$/.test(body.nalog || '') || body.nalog === 'SOPSTVENE';
  if (!nalogValid) return Promise.resolve({ error: 'Neispravan format naloga za realizaciju.' });
  if (!Array.isArray(body.stavke) || body.stavke.length === 0) return Promise.resolve({ error: 'Specifikacija je prazna.' });

  const godina = body.godina;
  const manualBroj = body.broj ? parseInt(body.broj, 10) : null;
  if (manualBroj && (!Number.isInteger(manualBroj) || manualBroj < 1)) {
    return Promise.resolve({ error: 'Redni broj mora biti pozitivan ceo broj.' });
  }

  return withData_(d => {
    const last = Number(d.counters[String(g)]) || 0;
    let next;
    if (manualBroj) {
      const candidateRedniBroj = `${g}/${godina}/${String(manualBroj).padStart(3, '0')}`;
      if (d.requests.some(r => r.redniBroj === candidateRedniBroj)) {
        return { changed: false, value: { error: 'Taj redni broj je već zauzet za ovo gradilište. Izaberi drugi.' } };
      }
      next = manualBroj;
      if (next > last) d.counters[String(g)] = next;
    } else {
      next = last + 1;
      d.counters[String(g)] = next;
    }

    const redniBroj = `${g}/${godina}/${String(next).padStart(3, '0')}`;
    const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
    const createdAt = Date.now();
    const request = { id, redniBroj, gradiliste: String(g), godina: String(godina), nalog: body.nalog, stavke: body.stavke, createdAt };
    d.requests.push(request);

    return { changed: true, message: `Dodaj zahtev ${redniBroj}`, value: { request } };
  });
}

function updateRequest_(body) {
  const nalogValid = /^\d+(\/\d+)*$/.test(body.nalog || '') || body.nalog === 'SOPSTVENE';
  if (!nalogValid) return Promise.resolve({ error: 'Neispravan format naloga za realizaciju.' });
  if (!Array.isArray(body.stavke) || body.stavke.length === 0) return Promise.resolve({ error: 'Specifikacija je prazna.' });

  return withData_(d => {
    const req = d.requests.find(r => r.id === body.id);
    if (!req) return { changed: false, value: { error: 'Zahtev nije pronađen.' } };
    req.nalog = body.nalog;
    req.stavke = body.stavke;
    return { changed: true, message: `Izmeni zahtev ${req.redniBroj}`, value: { request: req } };
  });
}

function deleteRequest_(id) {
  return withData_(d => {
    const idx = d.requests.findIndex(r => r.id === id);
    if (idx === -1) return { changed: false, value: { error: 'Zahtev nije pronađen.' } };
    const [removed] = d.requests.splice(idx, 1);
    return { changed: true, message: `Obriši zahtev ${removed.redniBroj}`, value: { ok: true } };
  });
}

/* ---- Gradilišta ---- */
function addGradiliste_(body) {
  const kod = parseInt(body.kod, 10);
  if (!kod || kod < 901 || kod > 999) return Promise.resolve({ error: 'Oznaka gradilišta mora biti broj od 901 do 999.' });
  const naziv = (body.naziv || '').trim();
  if (!naziv) return Promise.resolve({ error: 'Naziv gradilišta je obavezan.' });

  return withData_(d => {
    if (d.gradilista.some(g => String(g.kod) === String(kod))) {
      return { changed: false, value: { error: 'Gradilište sa tom oznakom već postoji.' } };
    }
    d.gradilista.push({ kod: String(kod), naziv });
    return { changed: true, message: `Dodaj gradilište ${kod}`, value: { gradiliste: { kod: String(kod), naziv } } };
  });
}

function updateGradiliste_(body) {
  const naziv = (body.naziv || '').trim();
  if (!naziv) return Promise.resolve({ error: 'Naziv gradilišta je obavezan.' });

  return withData_(d => {
    const g = d.gradilista.find(x => String(x.kod) === String(body.kod));
    if (!g) return { changed: false, value: { error: 'Gradilište nije pronađeno.' } };
    g.naziv = naziv;
    return { changed: true, message: `Izmeni gradilište ${body.kod}`, value: { gradiliste: { kod: String(body.kod), naziv } } };
  });
}

function deleteGradiliste_(body) {
  return withData_(d => {
    const idx = d.gradilista.findIndex(x => String(x.kod) === String(body.kod));
    if (idx === -1) return { changed: false, value: { error: 'Gradilište nije pronađeno.' } };
    d.gradilista.splice(idx, 1);
    return { changed: true, message: `Obriši gradilište ${body.kod}`, value: { ok: true } };
  });
}

/* ---- Nalozi ---- */
function addNalogAdmin_(body) {
  const kod = (body.kod || '').trim();
  if (!kod) return Promise.resolve({ error: 'Kod naloga je obavezan.' });
  const kodValid = /^\d+(\/\d+)*$/.test(kod) || kod === 'SOPSTVENE';
  if (!kodValid) return Promise.resolve({ error: 'Kod naloga mora biti niz brojeva odvojenih kosom crtom (npr. 720/26/011) ili "SOPSTVENE".' });
  const opis = (body.opis || '').trim();

  return withData_(d => {
    if (d.nalozi.some(n => n.kod === kod)) {
      return { changed: false, value: { error: 'Nalog sa tim kodom već postoji.' } };
    }
    const gradilistaVal = serializeGradilistaField_(body.gradiliste);
    d.nalozi.push({ kod, opis, gradiliste: gradilistaVal });
    return { changed: true, message: `Dodaj nalog ${kod}`, value: { nalog: { kod, opis, gradiliste: parseGradilistaField_(gradilistaVal) } } };
  });
}

function updateNalogAdmin_(body) {
  const opis = (body.opis || '').trim();
  return withData_(d => {
    const n = d.nalozi.find(x => x.kod === String(body.kod));
    if (!n) return { changed: false, value: { error: 'Nalog nije pronađen.' } };
    const gradilistaVal = serializeGradilistaField_(body.gradiliste);
    n.opis = opis;
    n.gradiliste = gradilistaVal;
    return { changed: true, message: `Izmeni nalog ${body.kod}`, value: { nalog: { kod: body.kod, opis, gradiliste: parseGradilistaField_(gradilistaVal) } } };
  });
}

function deleteNalogAdmin_(body) {
  return withData_(d => {
    const idx = d.nalozi.findIndex(x => x.kod === String(body.kod));
    if (idx === -1) return { changed: false, value: { error: 'Nalog nije pronađen.' } };
    d.nalozi.splice(idx, 1);
    return { changed: true, message: `Obriši nalog ${body.kod}`, value: { ok: true } };
  });
}

/* ---- Korisnici ---- */
function checkLogin_(body) {
  const username = (body.username || '').trim();
  const password = body.password || '';
  if (!username || !password) return Promise.resolve({ error: 'Korisničko ime i lozinka su obavezni.' });

  return readOnly_(d => {
    const u = d.korisnici.find(x => String(x.username) === username);
    if (u && String(u.password) === password) return { ok: true, username };
    return { error: 'Pogrešno korisničko ime ili lozinka.' };
  });
}

function addUser_(body) {
  const username = (body.username || '').trim();
  const password = body.password || '';
  if (!username) return Promise.resolve({ error: 'Korisničko ime je obavezno.' });
  if (!/^[a-zA-Z0-9._\-]+$/.test(username)) {
    return Promise.resolve({ error: 'Korisničko ime sme sadržati samo slova, brojeve, tačke, crtice i donje crte.' });
  }
  if (password.length < 6) return Promise.resolve({ error: 'Lozinka mora imati najmanje 6 karaktera.' });

  return withData_(d => {
    if (d.korisnici.some(u => u.username === username)) {
      return { changed: false, value: { error: 'Korisnik sa tim imenom već postoji.' } };
    }
    d.korisnici.push({ username, password });
    return { changed: true, message: `Dodaj korisnika ${username}`, value: { ok: true, username } };
  });
}

function deleteUser_(body) {
  const username = (body.username || '').trim();
  if (!username) return Promise.resolve({ error: 'Korisničko ime je obavezno.' });

  return withData_(d => {
    if (d.korisnici.length <= 1) return { changed: false, value: { error: 'Ne može se obrisati jedini preostali korisnik.' } };
    const idx = d.korisnici.findIndex(u => u.username === username);
    if (idx === -1) return { changed: false, value: { error: 'Korisnik nije pronađen.' } };
    d.korisnici.splice(idx, 1);
    return { changed: true, message: `Obriši korisnika ${username}`, value: { ok: true } };
  });
}

function updateUserPassword_(body) {
  const username = (body.username || '').trim();
  const password = body.password || '';
  if (!username) return Promise.resolve({ error: 'Korisničko ime je obavezno.' });
  if (password.length < 6) return Promise.resolve({ error: 'Nova lozinka mora imati najmanje 6 karaktera.' });

  return withData_(d => {
    const u = d.korisnici.find(x => x.username === username);
    if (!u) return { changed: false, value: { error: 'Korisnik nije pronađen.' } };
    u.password = password;
    return { changed: true, message: `Promeni lozinku za ${username}`, value: { ok: true } };
  });
}

/* ============================================================
   PRESRETANJE fetch() POZIVA KA STAROM GAS URL-U
   ============================================================ */
const _originalFetch = window.fetch.bind(window);
window.fetch = async function (url, opts) {
  if (typeof url === 'string' && url.indexOf(GAS_URL) === 0) {
    try {
      let result;
      if (opts && opts.method === 'POST') {
        const body = JSON.parse(opts.body);
        result = await doPostLogic_(body);
      } else {
        const qIndex = url.indexOf('?');
        const params = {};
        if (qIndex !== -1) {
          new URLSearchParams(url.slice(qIndex + 1)).forEach((v, k) => { params[k] = v; });
        }
        result = await doGetLogic_(params);
      }
      return { ok: true, json: async () => result };
    } catch (err) {
      console.error('GitHub backend greška:', err);
      return { ok: true, json: async () => ({ error: String(err.message || err) }) };
    }
  }
  return _originalFetch(url, opts);
};
