/* ============================================================
   ZBIRNA SPECIFIKACIJA PO NALOGU — zajednička za index.html i ponude.html.
   Pravi samostalnu stranicu (u novom tabu) sa svim pozicijama zahteva za
   izabrani nalog. Koristi globalne SUPABASE_CONFIG i LOGO_DATA_URI.
   ============================================================ */
function otvoriZbirnuSpecifikaciju({ nalog, tab, zahtevi, nazivGradilista, nazivNaloga }){
  const escapeHtml = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const matching = zahtevi.filter(r => r.nalog === nalog);
  if(matching.length === 0){ if(tab) tab.close(); alert('Nema sačuvanih zahteva za ovaj nalog.'); return; }
  // Sortiraj od manjeg ka većem po brojčanom delu rednog broja (poslednji
  // segment posle '/'), bez obzira na redosled unosa.
  const brojZaSortZbirno = r => {
    const parts = String(r.redniBroj||'').split('/');
    const n = parseInt(parts[parts.length-1], 10);
    return Number.isFinite(n) ? n : 0;
  };
  const sortedMatching = matching.slice().sort((a,b)=>brojZaSortZbirno(a)-brojZaSortZbirno(b));
  const requestsData = sortedMatching.map(r => ({
    id: r.id, redniBroj: r.redniBroj,
    gradilisteNaziv: nazivGradilista(r.gradiliste) || r.gradiliste,
    stavke: r.stavke || []
  }));
  const nalogOpisText = nazivNaloga(nalog) || '';

  const html = `<!DOCTYPE html>
<html lang="sr">
<head>
<meta charset="UTF-8">
<title>Zbirna specifikacija — ${escapeHtml(nalog)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
*{box-sizing:border-box;}
body{font-family:'IBM Plex Sans',sans-serif;color:#1a1a1a;margin:0;padding:20px 24px;font-size:13px;background:#EAEBE4;}
h1{font-family:'Space Grotesk',sans-serif;font-size:20px;text-transform:uppercase;letter-spacing:0.04em;margin:0 0 4px;}
.sub{font-size:11.5px;color:#666;font-family:'IBM Plex Mono',monospace;margin-bottom:6px;}
.toolbar{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;gap:16px;flex-wrap:nowrap;}
.toolbar-right{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end;}
.status-msg{font-size:12px;color:#666;}
.save-banner{font-size:12.5px;font-weight:600;padding:6px 12px;border-radius:3px;display:none;}
.save-banner.ok{display:inline-block;background:#D7EBDC;color:#2E5E3B;}
.save-banner.err{display:inline-block;background:#F8D3CC;color:#8A3B2B;}
.toolbar button{font-family:'IBM Plex Sans',sans-serif;font-weight:600;font-size:13px;padding:9px 16px;border-radius:3px;border:1px solid #243D4C;background:#243D4C;color:#fff;cursor:pointer;}
.toolbar button.ghost{background:#F7F7F2;color:#243D4C;}
.card{background:#F7F7F2;border:1px solid #CBCFC5;border-radius:3px;padding:16px;overflow-x:auto;}
table{width:100%;border-collapse:collapse;}
th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1.5px solid #1a1a1a;padding:6px 8px;color:#444;white-space:nowrap;}
td{padding:7px 8px;border-bottom:1px solid #ddd;font-size:12.5px;}
.num{text-align:right;font-family:'IBM Plex Mono',monospace;}
.status-nije td{background:#F1948A;color:#1a1a1a;}
.status-porucena td{background:#F8C471;color:#1a1a1a;}
.status-isporucena td{background:#82E0AA;color:#1a1a1a;}
.status-ne-porucuje td{background:#B5E3C4;color:#1a1a1a;}
.status-ne-porucuje td:nth-child(5){text-decoration:line-through;text-decoration-color:rgba(0,0,0,.45);}
textarea.napomena-zbirna.nap-obavezna{border:2px solid #C62828;background:#FFF4F2;}
select, input[type=date], input[type=number], input[type=text]{font-family:'IBM Plex Sans',sans-serif;font-size:12.5px;padding:5px 6px;border-radius:3px;border:1px solid #CBCFC5;background:#fff;color:inherit;}
select:disabled, input[type=date]:disabled, input[type=number]:disabled, input[type=text]:disabled{background:#E7E8E1;color:var(--ink-soft);cursor:not-allowed;}
textarea.napomena-zbirna{font-family:'IBM Plex Sans',sans-serif;font-size:12.5px;padding:5px 6px;border-radius:3px;border:1px solid #CBCFC5;background:#fff;color:inherit;width:220px;min-height:30px;resize:vertical;display:block;}
.filter-row th{padding:4px 8px 8px;border-bottom:1.5px solid #1a1a1a;}
.filter-row input[type=text]{width:100%;min-width:70px;padding:5px 7px;font-size:11.5px;font-weight:400;text-transform:none;letter-spacing:normal;}
@media print{.toolbar{display:none;}.filter-row{display:none;}body{background:#fff;}.card{border:none;padding:0;overflow:visible;}table{width:auto;}th{white-space:normal;}}
@page{ margin:10mm; }
</style>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"><\/script>
</head>
<body>
  <div class="toolbar">
    <div>
      <img src="${LOGO_DATA_URI}" alt="Termoelektro Enel AD" style="height:36px;width:auto;display:block;margin-bottom:8px;">
      <h1>Zbirna specifikacija</h1>
      <div class="sub">Nalog za realizaciju: ${escapeHtml(nalog)}${nalogOpisText ? ' — ' + escapeHtml(nalogOpisText) : ''} · Otvoreno ${new Date().toLocaleString('sr-RS')}</div>
    </div>
    <div class="toolbar-right">
      <span class="save-banner" id="saveBanner"></span>
      <span class="status-msg" id="statusMsg"></span>
      <button type="button" class="ghost" id="sacuvajSveBtn">Sačuvaj</button>
      <button onclick="window.print()">Štampaj / sačuvaj PDF</button>
    </div>
  </div>
  <div class="card">
    <table>
      <thead><tr>
        <th>Redni broj</th><th>Gradilište</th><th style="text-align:center;">Rb.</th>
        <th>Broj poz. spec.</th><th style="min-width:600px;">Opis</th>
        <th>Jed. mere</th><th style="text-align:right;">Za nabavku</th>
        <th style="text-align:right;">Isporučeno</th>
        <th style="text-align:right;">Preostalo za isporuku</th>
        <th>Rok isporuke</th><th style="text-align:center;">Atest</th>
        <th>Status</th><th>Datum isporuke</th>
        <th>Dobavljač</th><th>Otpremnica</th><th>Prijemnica</th><th style="min-width:220px;">Napomena</th>
      </tr>
      <tr class="filter-row">
        <th><input type="text" data-filter="redniBroj" placeholder="filtriraj…"></th>
        <th><input type="text" data-filter="gradiliste" placeholder="filtriraj…"></th>
        <th></th>
        <th><input type="text" data-filter="sifra" placeholder="filtriraj…"></th>
        <th><input type="text" data-filter="opis" placeholder="filtriraj…"></th>
        <th><input type="text" data-filter="jm" placeholder="filtriraj…"></th>
        <th></th>
        <th></th>
        <th></th>
        <th></th>
        <th></th>
        <th><input type="text" data-filter="status" placeholder="filtriraj…"></th>
        <th></th>
        <th><input type="text" data-filter="dobavljac" placeholder="filtriraj…"></th>
        <th><input type="text" data-filter="otpremnica" placeholder="filtriraj…"></th>
        <th><input type="text" data-filter="prijemnica" placeholder="filtriraj…"></th>
        <th><input type="text" data-filter="napomenaZbirna" placeholder="filtriraj…"></th>
      </tr></thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>
<script>
const LOGO_DATA_URI = ${JSON.stringify(LOGO_DATA_URI)};
const SB_URL = ${JSON.stringify(SUPABASE_CONFIG.url)};
const SB_KEY = ${JSON.stringify(SUPABASE_CONFIG.anonKey)};
// Izričito zabranjuje keširanje GET zahteva (isti razlog i ista ispravka kao
// u glavnom supabase-backend.js) — ova stranica ima SVOJ, odvojen klijent
// (otvara se u novom tabu), pa mora posebno da dobije istu zaštitu, inače
// prikazuje zastarele podatke dok se ne uradi tvrdo osvežavanje.
function noCacheFetchZbirna_(url, options = {}) {
  const jeGet = !options.method || options.method.toUpperCase() === 'GET';
  let headers = options.headers;
  if (jeGet) {
    headers = new Headers(options.headers || {});
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    headers.set('Pragma', 'no-cache');
  }
  return fetch(url, { ...options, cache: 'no-store', headers });
}
const sbClient = window.supabase.createClient(SB_URL, SB_KEY, { global: { fetch: noCacheFetchZbirna_ } });
const NALOG = ${JSON.stringify(nalog)};
let REQUESTS = ${JSON.stringify(requestsData)};
function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function formatDatumSr(iso){ if(!iso) return '—'; const p=String(iso).split('-'); if(p.length!==3) return iso; return p[2]+'.'+p[1]+'.'+p[0]+'.'; }
function statusKlasa(s){ if(s==='poručeno') return 'status-porucena'; if(s==='isporučeno') return 'status-isporucena'; if(s==='ne poručuje se') return 'status-ne-porucuje'; return 'status-nije'; }
function preostaloZaIsporuku(s){ const z=isNaN(parseFloat(s.zaNabavku))?0:parseFloat(s.zaNabavku); const i=isNaN(parseFloat(s.isporuceno))?0:parseFloat(s.isporuceno); return Math.round((z-i)*1000)/1000; }
let FILTERI = { redniBroj:'', gradiliste:'', sifra:'', opis:'', jm:'', status:'', dobavljac:'', otpremnica:'', prijemnica:'', napomenaZbirna:'' };
function podudaraSeFilteru_(vrednost, filter){
  if(!filter) return true;
  return String(vrednost??'').toLowerCase().includes(filter.toLowerCase());
}
function render(){
  const tbody=document.getElementById('tbody'); let html=''; let brojPrikazanih=0;
  REQUESTS.forEach((r,reqIdx)=>{ (r.stavke||[]).forEach((s,idx)=>{ if(!s.status) s.status='nije poručeno';
    if(!podudaraSeFilteru_(r.redniBroj, FILTERI.redniBroj)) return;
    if(!podudaraSeFilteru_(r.gradilisteNaziv, FILTERI.gradiliste)) return;
    if(!podudaraSeFilteru_(s.sifra, FILTERI.sifra)) return;
    if(!podudaraSeFilteru_(s.opis, FILTERI.opis)) return;
    if(!podudaraSeFilteru_(s.jm, FILTERI.jm)) return;
    if(!podudaraSeFilteru_(s.status, FILTERI.status)) return;
    if(!podudaraSeFilteru_(s.dobavljac, FILTERI.dobavljac)) return;
    if(!podudaraSeFilteru_(s.otpremnica, FILTERI.otpremnica)) return;
    if(!podudaraSeFilteru_(s.prijemnica, FILTERI.prijemnica)) return;
    if(!podudaraSeFilteru_(s.napomenaZbirna, FILTERI.napomenaZbirna)) return;
    brojPrikazanih++;
    html+='<tr class="'+statusKlasa(s.status)+'">'
      +'<td style="font-family:\\'IBM Plex Mono\\',monospace;white-space:nowrap;">'+escapeHtml(r.redniBroj)+'</td>'
      +'<td>'+escapeHtml(r.gradilisteNaziv)+'</td>'
      +'<td style="text-align:center;">'+(idx+1)+'</td>'
      +'<td>'+escapeHtml(s.sifra||'—')+'</td>'
      +'<td>'+escapeHtml(s.opis)+'</td>'
      +'<td>'+escapeHtml(s.jm)+'</td>'
      +'<td class="num" style="font-weight:600;">'+escapeHtml(s.zaNabavku!==undefined?s.zaNabavku:'')+'</td>'
      +'<td><input type="number" min="0" step="any" style="width:80px;" data-req="'+reqIdx+'" data-idx="'+idx+'" data-field="isporuceno" value="'+escapeHtml(s.isporuceno||'')+'"></td>'
      +'<td class="num" style="font-weight:600;">'+(s.status==='ne poručuje se'?'—':escapeHtml(preostaloZaIsporuku(s)))+'</td>'
      +'<td>'+escapeHtml(formatDatumSr(s.rok))+'</td>'
      +'<td style="text-align:center;">'+escapeHtml(s.atest||'—')+'</td>'
      +'<td><select data-req="'+reqIdx+'" data-idx="'+idx+'" data-field="status">'
        +'<option value="nije poručeno"'+(s.status==='nije poručeno'?' selected':'')+'>nije poručeno</option>'
        +'<option value="poručeno"'+(s.status==='poručeno'?' selected':'')+'>poručeno</option>'
        +'<option value="isporučeno"'+(s.status==='isporučeno'?' selected':'')+'>isporučeno</option>'
        +'<option value="ne poručuje se"'+(s.status==='ne poručuje se'?' selected':'')+'>ne poručuje se</option>'
      +'</select></td>'
      +'<td><input type="date" data-req="'+reqIdx+'" data-idx="'+idx+'" data-field="datumIsporuke" value="'+escapeHtml(s.datumIsporuke||'')+'"></td>'
      +'<td><input type="text" style="width:120px;" data-req="'+reqIdx+'" data-idx="'+idx+'" data-field="dobavljac" value="'+escapeHtml(s.dobavljac||'')+'"></td>'
      +'<td><input type="text" style="width:100px;" data-req="'+reqIdx+'" data-idx="'+idx+'" data-field="otpremnica" value="'+escapeHtml(s.otpremnica||'')+'"></td>'
      +'<td><input type="text" style="width:100px;" data-req="'+reqIdx+'" data-idx="'+idx+'" data-field="prijemnica" value="'+escapeHtml(s.prijemnica||'')+'"></td>'
      +'<td><textarea rows="1" class="napomena-zbirna" data-req="'+reqIdx+'" data-idx="'+idx+'" data-field="napomenaZbirna" placeholder="komentar…">'+escapeHtml(s.napomenaZbirna||'')+'</textarea></td>'
      +'</tr>';
  }); });
  tbody.innerHTML = html || '<tr><td colspan="17" style="text-align:center;color:#888;padding:16px;">Nema pozicija koje odgovaraju filterima.</td></tr>';
  tbody.querySelectorAll('[data-field]').forEach(el=>el.addEventListener('change',onFieldChange));
}
document.querySelectorAll('[data-filter]').forEach(inp=>{
  inp.addEventListener('input', e=>{
    FILTERI[e.target.dataset.filter] = e.target.value;
    render();
  });
});
async function onFieldChange(e){
  const reqIdx=parseInt(e.target.dataset.req,10); const idx=parseInt(e.target.dataset.idx,10);
  const field=e.target.dataset.field; const value=e.target.value;
  const req=REQUESTS[reqIdx]; const stavka=req.stavke[idx]; stavka[field]=value;
  if(field==='isporuceno'){
    const z=parseFloat(stavka.zaNabavku); const i=parseFloat(value);
    if(!isNaN(z)&&!isNaN(i)&&z!==0&&stavka.status!=='ne poručuje se'){ if(i===z) stavka.status='isporučeno'; else if(i>0&&i<z) stavka.status='poručeno'; }
  }
  const statusMsg=document.getElementById('statusMsg'); statusMsg.textContent='Čuvanje…';
  try{
    const { error }=await sbClient.rpc('update_isporuka_stavke', { p_request_id: req.id, p_stavke: req.stavke });
    statusMsg.textContent=error?'Greška: '+error.message:'Sačuvano '+new Date().toLocaleTimeString('sr-RS');
  }catch(err){ statusMsg.textContent='Greška pri čuvanju — proveri konekciju.'; }
  render();
  if(field==='status' && value==='ne poručuje se' && !String(stavka.napomenaZbirna||'').trim()){
    const nap=document.querySelector('textarea[data-req="'+reqIdx+'"][data-idx="'+idx+'"][data-field="napomenaZbirna"]');
    if(nap){ nap.classList.add('nap-obavezna'); nap.placeholder='upiši zašto se ne poručuje…'; nap.focus(); }
    statusMsg.textContent='Sačuvano — upiši u Napomenu zašto se pozicija ne poručuje.';
  }
}
async function sacuvajSve(){
  const banner=document.getElementById('saveBanner');
  const btn=document.getElementById('sacuvajSveBtn');
  btn.disabled=true; btn.textContent='Čuvanje…';
  banner.className='save-banner'; banner.textContent='';
  let greske=0;
  for(const req of REQUESTS){
    try{
      const { error } = await sbClient.rpc('update_isporuka_stavke', { p_request_id: req.id, p_stavke: req.stavke });
      if(error) greske++;
    }catch(err){ greske++; }
  }
  btn.disabled=false; btn.textContent='Sačuvaj';
  if(greske===0){
    banner.className='save-banner ok';
    banner.textContent='✓ Sve izmene su sačuvane ('+new Date().toLocaleTimeString('sr-RS')+')';
  }else{
    banner.className='save-banner err';
    banner.textContent='Greška pri čuvanju za '+greske+' zahtev(a) — pokušaj ponovo.';
  }
  setTimeout(()=>{ banner.className='save-banner'; banner.textContent=''; }, 6000);
}
document.getElementById('sacuvajSveBtn').addEventListener('click', sacuvajSve);
render();
<\/script>
</body>
</html>`;

  const blob = new Blob([html], { type:'text/html' });
  const url = URL.createObjectURL(blob);
  if(tab){ tab.location.href = url; return; }
  const novi = window.open(url, '_blank');
  if(!novi) alert('Browser je blokirao otvaranje novog taba. Dozvoli pop-up prozore za ovu stranicu i pokušaj ponovo.');
}
