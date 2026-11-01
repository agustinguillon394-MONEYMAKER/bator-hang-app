(function(){
'use strict';
var K = window.KATALOGUS;
var TAR_KULCS = 'bh-kulcsok', TAR_KESZ = 'bh-kesz';
var app = document.getElementById('app');
var tartalom = {};      // id -> visszafejtett tartalom
var telepitoEsemeny = null;

/* ---------- tárolás (privát módban is működjön) ---------- */
function olvas(nev, alap){ try { var s = localStorage.getItem(nev); return s ? JSON.parse(s) : alap; } catch(e){ return alap; } }
function ir(nev, ertek){ try { localStorage.setItem(nev, JSON.stringify(ertek)); } catch(e){} }
var kulcsok = olvas(TAR_KULCS, {});
var kesz = olvas(TAR_KESZ, {});

/* ---------- kulcsok a linkből: ?k=m.XXXX~o1.YYYY ---------- */
function kulcsokLinkbol(szoveg){
  var talalt = {}, m = /[?#&]k=([A-Za-z0-9_.~\-]+)/.exec(szoveg || '');
  if (!m) return talalt;
  m[1].split('~').forEach(function(darab){
    var p = darab.split('.');
    if (p.length === 2 && /^[a-z0-9]{1,3}$/.test(p[0]) && p[1].length >= 40) talalt[p[0]] = p[1];
  });
  return talalt;
}
function linkFrissit(){
  // A címsorban mindig ott vannak a kulcsok: iPhone-on ebből a címből lesz a főképernyő-ikon.
  var r = Object.keys(kulcsok).map(function(id){ return id + '.' + kulcsok[id]; }).join('~');
  var uj = location.pathname + (r ? '?k=' + r : '');
  try { history.replaceState(null, '', uj); } catch(e){}
}

/* ---------- visszafejtés (AES-GCM) ---------- */
function b64(s){
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  var bin = atob(s), u = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function visszafejt(id, kulcs){
  return fetch('adat/' + id + '.bin?v=' + K.v, {cache: 'no-cache'})
    .then(function(r){ if (!r.ok) throw new Error('nincs'); return r.arrayBuffer(); })
    .then(function(buf){
      var u = new Uint8Array(buf);
      return crypto.subtle.importKey('raw', b64(kulcs), 'AES-GCM', false, ['decrypt'])
        .then(function(k){ return crypto.subtle.decrypt({name: 'AES-GCM', iv: u.slice(0, 12)}, k, u.slice(12)); });
    })
    .then(function(sima){ return JSON.parse(new TextDecoder().decode(sima)); });
}
function mindetBetolt(){
  return Promise.all(Object.keys(kulcsok).map(function(id){
    // Si falla (sin señal), la clave se queda guardada para la próxima vez.
    return visszafejt(id, kulcsok[id]).then(function(t){ tartalom[id] = t; }, function(){});
  }));
}

/* ---------- segédek ---------- */
function el(html){ var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
var LAKAT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z"/></svg>';
var IKON = {video: '&#9654;', pdf: 'PDF', fajl: '&#8681;', link: '&#8599;'};
function uzen(sz){
  var u = document.getElementById('uzenet'); u.textContent = sz; u.hidden = false;
  clearTimeout(uzen.t); uzen.t = setTimeout(function(){ u.hidden = true; }, 3200);
}
function telepitve(){ return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
function iphone(){ return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

/* ---------- elemek (videó, PDF, fájl) ---------- */
function elemGomb(e){
  var megvan = kesz[e.id] ? ' megvan' : '';
  var b = el('<button class="elem' + megvan + '"><span class="ik">' + (megvan ? '&#10003;' : (IKON[e.t] || IKON.pdf)) + '</span>' +
    '<span><b>' + esc(e.cim) + '</b><span>' + esc(e.al || (e.t === 'video' ? 'Videó' : 'PDF')) + (e.hossz ? ' · ' + esc(e.hossz) : '') + '</span></span></button>');
  b.addEventListener('click', function(){ nyit(e); });
  return b;
}
function nyit(e){
  if (e.t === 'link' || e.t === 'fajl') { window.open(e.url, '_blank', 'noopener'); jelol(e.id, true); return; }
  document.getElementById('nezo-cim').textContent = e.cim;
  document.getElementById('nezo-keret').src = 'https://drive.google.com/file/d/' + e.drive + '/preview';
  document.getElementById('nezo-nyit').href = 'https://drive.google.com/file/d/' + e.drive + '/view';
  var kg = document.getElementById('nezo-kesz');
  kg.textContent = kesz[e.id] ? 'Kész ✓' : 'Késznek jelölöm';
  kg.onclick = function(){ jelol(e.id, !kesz[e.id]); kg.textContent = kesz[e.id] ? 'Kész ✓' : 'Késznek jelölöm'; };
  lapNyit('nezo');
}
function jelol(id, ertek){
  if (ertek) kesz[id] = 1; else delete kesz[id];
  ir(TAR_KESZ, kesz); rajzol();
}

/* ---------- lapok ---------- */
function lapNyit(id){ document.getElementById(id).hidden = false; document.body.style.overflow = 'hidden'; try { history.pushState({lap: id}, ''); } catch(e){} }
function lapZar(){
  ['nezo', 'telepit'].forEach(function(id){ document.getElementById(id).hidden = true; });
  document.getElementById('nezo-keret').src = 'about:blank';
  document.body.style.overflow = '';
}
document.querySelectorAll('[data-zar]').forEach(function(b){ b.addEventListener('click', function(){ history.state && history.state.lap ? history.back() : lapZar(); }); });
window.addEventListener('popstate', lapZar);

/* ---------- telepítési útmutató ---------- */
var MEGOSZT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 7.5 6.5l1.4 1.4L11 5.8V15h2V5.8l2.1 2.1 1.4-1.4L12 2ZM5 10v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10h-3v2h1v8H7v-8h1v-2H5Z"/></svg>';
function utmutato(rendszer){
  var t = document.getElementById('telepit-test');
  var ios = rendszer === 'ios';
  var h = '<div class="valaszto"><button data-r="ios" class="' + (ios ? 'ez' : '') + '">iPhone</button><button data-r="and" class="' + (!ios ? 'ez' : '') + '">Android</button></div>' +
    '<p style="margin:0 0 14px;color:var(--halv)">Egy perc az egész. Utána egy koppintással nyílik, mint bármelyik alkalmazás, és mindig ott lesz minden anyagod.</p>';
  if (ios) {
    h += '<div class="figy">Fontos: Safariban nyisd meg ezt az oldalt. Ha az e-mailből máshol nyílt meg, másold ki a linket, és illeszd be a Safariba.</div>' +
      '<div class="lepes"><i>1</i><p>Koppints alul a <span class="jel">' + MEGOSZT + ' Megosztás</span> gombra (négyzet, felfelé mutató nyíllal). Ha nem látod, görgess egy kicsit felfelé.</p></div>' +
      '<div class="lepes"><i>2</i><p>Görgess le a listában, és válaszd a <span class="jel">Főképernyőhöz adás</span> lehetőséget.</p></div>' +
      '<div class="lepes"><i>3</i><p>Jobb fent koppints a <span class="jel">Hozzáadás</span> gombra. Kész: a Bátor Hang ikon ott van a főképernyőn.</p></div>';
  } else {
    if (telepitoEsemeny) h += '<button class="gomb" id="telepit-most" style="margin-bottom:16px">Telepítés most</button><p style="margin:0 0 12px;color:var(--halv);font-size:14px">Ha a gomb nem működik, csináld így:</p>';
    h += '<div class="lepes"><i>1</i><p>Chrome-ban koppints jobb fent a <span class="jel">&#8942;</span> gombra (három pötty).</p></div>' +
      '<div class="lepes"><i>2</i><p>Válaszd az <span class="jel">Alkalmazás telepítése</span> vagy a <span class="jel">Hozzáadás a kezdőképernyőhöz</span> lehetőséget.</p></div>' +
      '<div class="lepes"><i>3</i><p>Koppints a <span class="jel">Telepítés</span> gombra. Kész: a Bátor Hang ikon ott van a telefonodon.</p></div>';
  }
  h += '<p style="color:var(--halv);font-size:14px;margin-top:18px">Ha később új anyagot vásárolsz, az e-mailben kapott linkkel nyílik meg itt is.</p>';
  t.innerHTML = h;
  t.querySelectorAll('[data-r]').forEach(function(b){ b.addEventListener('click', function(){ utmutato(b.getAttribute('data-r')); }); });
  var most = document.getElementById('telepit-most');
  if (most) most.addEventListener('click', function(){
    telepitoEsemeny.prompt();
    telepitoEsemeny.userChoice.then(function(){ telepitoEsemeny = null; lapZar(); rajzol(); });
  });
}
window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); telepitoEsemeny = e; });
window.addEventListener('appinstalled', function(){ uzen('Kész! Megtalálod a telefonod főképernyőjén.'); });

/* ---------- feloldó mező ---------- */
function feloldo(cim, szoveg){
  var d = el('<div class="feloldo"><b>' + cim + '</b><p>' + szoveg + '</p>' +
    '<input type="url" inputmode="url" autocomplete="off" placeholder="Illeszd be ide a linket">' +
    '<button class="gomb voros">Feloldás</button></div>');
  var inp = d.querySelector('input');
  d.querySelector('button').addEventListener('click', function(){ ujKulcsok(kulcsokLinkbol(inp.value), true); });
  return d;
}
function ujKulcsok(talalt, kezi){
  var ujak = Object.keys(talalt).filter(function(id){ return kulcsok[id] !== talalt[id]; });
  if (!ujak.length) { if (kezi) uzen(Object.keys(talalt).length ? 'Ez már fel van oldva.' : 'Ez a link nem jó. Másold be újra az egészet.'); return Promise.resolve(); }
  return Promise.all(ujak.map(function(id){
    return visszafejt(id, talalt[id]).then(function(t){ kulcsok[id] = talalt[id]; tartalom[id] = t; return t.cim; }, function(){ return null; });
  })).then(function(nevek){
    nevek = nevek.filter(Boolean);
    ir(TAR_KULCS, kulcsok); linkFrissit(); rajzol();
    if (nevek.length) uzen('Feloldva: ' + nevek.join(', '));
    else if (kezi) uzen('Ez a link nem jó. Másold be újra az egészet.');
  });
}

/* ---------- rajzolás ---------- */
function termekKartya(p){
  var nyitott = !!tartalom[p.id];
  var d = el('<div class="termek' + (nyitott ? '' : ' zart') + '"><div class="kep"><img src="' + p.kep + '" alt="" loading="lazy" width="600" height="800">' +
    '<span class="cimke">' + (nyitott ? 'A tiéd' : 'Zárolva') + '</span>' + (nyitott ? '' : '<span class="lakat"><i>' + LAKAT + '</i></span>') + '</div>' +
    '<div class="tt"><b>' + esc(p.cim) + '</b><p>' + esc(p.sor) + '</p></div></div>');
  var tt = d.querySelector('.tt');
  if (nyitott && !tartalom[p.id].elemek.length) {
    tt.appendChild(el('<button class="gomb masod" disabled>Hamarosan érkezik</button>'));
  } else if (nyitott) {
    var g = el('<button class="gomb">Megnyitom</button>');
    g.addEventListener('click', function(){
      var el0 = tartalom[p.id].elemek;
      if (el0.length === 1) nyit(el0[0]); else extraLista(p);
    });
    tt.appendChild(g);
  } else if (p.vasar) {
    tt.appendChild(el('<a class="gomb voros" href="' + p.vasar + '" target="_blank" rel="noopener">Megszerzem</a>'));
  } else {
    tt.appendChild(el('<button class="gomb masod" disabled>Hamarosan</button>'));
  }
  return d;
}
function extraLista(p){
  var t = document.getElementById('telepit-test');
  document.querySelector('#telepit .lap-fej b').textContent = p.cim;
  t.innerHTML = '';
  tartalom[p.id].elemek.forEach(function(e){ t.appendChild(elemGomb(e)); });
  lapNyit('telepit');
}

function rajzol(){
  app.innerHTML = '';
  var fo = tartalom.m;
  if (!fo) {
    var b = el('<section class="belepes"><h1>Üdv a Bátor Hangban!</h1><p>A tananyagodat a vásárlás után e-mailben kapott linkkel nyitod meg.</p></section>');
    b.appendChild(feloldo('Megvan a linked?', 'Másold ki az e-mailből, és illeszd be ide. Ezzel feloldod a programodat.'));
    app.appendChild(b);
    return;
  }
  var osszes = [], megnezett = 0;
  fo.napok.forEach(function(n){ n.elemek.forEach(function(e){ osszes.push(e.id); if (kesz[e.id]) megnezett++; }); });
  var szazalek = osszes.length ? Math.round(megnezett / osszes.length * 100) : 0;
  app.appendChild(el('<section class="udv"><h1>Üdv a Bátor Hangban!<span>Napi egy lecke, 7 nap.</span></h1>' +
    '<p>Kezdd az 1. nappal, nézd meg a videót, aztán csináld meg a munkafüzet hozzá tartozó részét. Ennyi a mai feladat.</p>' +
    '<div class="halad"><i style="width:' + szazalek + '%"></i></div><div class="halad-szam">' + megnezett + ' / ' + osszes.length + ' videó kész</div></section>'));

  if (!telepitve()) {
    var s = el('<button class="tel-sav"><span><b>Tedd ki a telefonodra</b><span>Így egy koppintással eléred, mint egy alkalmazást.</span></span><span class="nyil">&#8250;</span></button>');
    s.addEventListener('click', function(){ document.querySelector('#telepit .lap-fej b').textContent = 'Tedd ki a telefonodra'; utmutato(iphone() ? 'ios' : 'and'); lapNyit('telepit'); });
    app.appendChild(s);
  }

  app.appendChild(el('<div class="szakasz"><h2>A programod</h2><p>15 videólecke magyarul, 7 napra beosztva.</p></div>'));
  var elsoNyitott = false;
  fo.napok.forEach(function(n){
    var mind = n.elemek.every(function(e){ return kesz[e.id]; });
    var nyitva = !mind && !elsoNyitott; if (nyitva) elsoNyitott = true;
    var d = el('<div class="nap' + (mind ? ' kesz' : '') + (nyitva ? ' nyitva' : '') + '"><button><span class="szam">' + (mind ? '&#10003;' : esc(n.szam)) + '</span>' +
      '<span class="nc"><b>' + esc(n.cim) + '</b><span>' + n.elemek.length + ' videó</span></span><span class="le">&#9662;</span></button><ul></ul></div>');
    d.querySelector('button').addEventListener('click', function(){ d.classList.toggle('nyitva'); });
    var ul = d.querySelector('ul');
    n.elemek.forEach(function(e){ var li = document.createElement('li'); li.appendChild(elemGomb(e)); ul.appendChild(li); });
    app.appendChild(d);
  });

  app.appendChild(el('<div class="szakasz"><h2>Munkafüzet és bónuszok</h2><p>Nyisd meg, vagy töltsd le a telefonodra.</p></div>'));
  fo.anyagok.forEach(function(e){ app.appendChild(elemGomb(e)); });

  [['extrak', 'Következő lépések', 'A programod folytatása. Ami a tiéd, azt egy koppintással megnyitod.'],
   ['kieg', 'Kiegészítők', 'Rövid, kész anyagok, amiket még ezen a héten használhatsz.']].forEach(function(x){
    app.appendChild(el('<div class="szakasz"><h2>' + x[1] + '</h2><p>' + x[2] + '</p></div>'));
    var r = el('<div class="racs"></div>');
    K[x[0]].forEach(function(p){ r.appendChild(termekKartya(p)); });
    app.appendChild(r);
  });

  app.appendChild(feloldo('Új vásárlásod van?', 'Illeszd be az e-mailben kapott linket, és itt is feloldjuk. Vagy egyszerűen nyisd meg a linket.'));
}

/* ---------- indulás ---------- */
// ?r=1 borra lo guardado (solo para probar cómo lo ve un cliente nuevo).
if (/[?&]r=1/.test(location.search)) { kulcsok = {}; kesz = {}; ir(TAR_KESZ, kesz); }
var linkbol = kulcsokLinkbol(location.search + location.hash);
Object.keys(linkbol).forEach(function(id){ kulcsok[id] = linkbol[id]; });
app.innerHTML = '<p style="text-align:center;color:var(--halv);padding:60px 0">Betöltés…</p>';
mindetBetolt().then(function(){ ir(TAR_KULCS, kulcsok); linkFrissit(); rajzol(); });

if (!iphone()) {
  // iPhone-on nincs manifest: így a főképernyő-ikon a kulcsos címet jegyzi meg.
  var m = document.createElement('link'); m.rel = 'manifest'; m.href = 'manifest.webmanifest?v=' + K.v; document.head.appendChild(m);
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js?v=' + K.v).catch(function(){});
})();
