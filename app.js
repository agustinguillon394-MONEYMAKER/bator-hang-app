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

/* ---------- «Belenézek»: mi van benne + a következő lépés a megfelelő pillanatban (03/11) ---------- */
function vasarLink(p){ return p.akcio ? p.akcio.vasar : p.vasar; }
function akcioJel(p){ return p.akcio ? ' <span class="akcio-jel">−' + p.akcio.szazalek + '%</span>' : ''; }
function akcioSor(p){ return p.akcio ? '<span class="akcio-sor">−' + p.akcio.szazalek + '% csak az appban</span>' : ''; }
function termek(id){ return K.extrak.concat(K.kieg).filter(function(p){ return p.id === id; })[0]; }
function belenez(p){
  var t = lapTest(p.cim);
  t.appendChild(el('<img class="belul-kep" src="' + p.kep + '" alt="">'));
  t.appendChild(el('<p class="sos-be">' + akcioSor(p) + esc(p.sor) + '</p>'));
  var ol = el('<ol class="belul"></ol>');
  p.belul.forEach(function(k){ ol.appendChild(el('<li><b>' + esc(k[0]) + '</b>' + (k[1] ? '<span>' + esc(k[1]) + '</span>' : '') + '</li>')); });
  t.appendChild(el('<p class="belul-cim">Ez van benne:</p>')); t.appendChild(ol);
  t.appendChild(el('<a class="gomb voros" href="' + vasarLink(p) + '" target="_blank" rel="noopener">Megszerzem' + akcioJel(p) + '</a>'));
  lapNyit('telepit');
}
// melyik nap után mit ajánlunk (az utazás és az autó: ami ott hiányzik)
var UTANA = {
  '1': ['b4', 'Hamarosan neked kell beszélned? Ezzel 20 perc alatt összerakod.'],
  '2': ['o2', 'A lámpaláz gyakorlással múlik el. Gyakorolj éles helyzeteket a telefonodon, bármikor.'],
  '4': ['o4', 'Most, hogy figyelsz a kiejtésedre, szabadulj meg az „ööö”-ktől is.'],
  '6': ['o1', 'Ha a történeteid eladnak, a szavaidból bevétel is lehet.'],
  '7': ['o3', 'Megvan a hangod. Most használd arra, hogy kapcsolatokat építs.']
};
function ajanlo(id, szoveg){
  var p = termek(id);
  if (!p || tartalom[id] || !p.vasar) return null;
  var d = el('<div class="ajanlo"><img src="' + p.kep + '" alt=""><div><small>A következő lépés</small><b>' + esc(p.cim) + '</b><p>' + esc(szoveg) + '</p><div class="ajanlo-gomb"></div></div></div>');
  var g = d.querySelector('.ajanlo-gomb');
  if (p.belul) { var bn = el('<button class="gomb masod">Belenézek</button>'); bn.addEventListener('click', function(){ belenez(p); }); g.appendChild(bn); }
  g.appendChild(el('<a class="gomb voros" href="' + vasarLink(p) + '" target="_blank" rel="noopener">Megszerzem' + akcioJel(p) + '</a>'));
  return d;
}

/* ---------- előtte és utána: hangfelvétel az 1. és a 7. napon (03/11) ---------- */
var HANG_DB = null;
function hangDb(){
  if (HANG_DB) return HANG_DB;
  HANG_DB = new Promise(function(ok, hiba){
    var r = indexedDB.open('bh-hang', 1);
    r.onupgradeneeded = function(){ r.result.createObjectStore('felvetel'); };
    r.onsuccess = function(){ ok(r.result); }; r.onerror = function(){ hiba(r.error); };
  });
  return HANG_DB;
}
function hangOlvas(kulcs){
  return hangDb().then(function(db){ return new Promise(function(ok){
    var q = db.transaction('felvetel').objectStore('felvetel').get(kulcs); q.onsuccess = function(){ ok(q.result || null); }; q.onerror = function(){ ok(null); };
  }); }).catch(function(){ return null; });
}
function hangIr(kulcs, ertek){
  return hangDb().then(function(db){ return new Promise(function(ok, hiba){
    var tx = db.transaction('felvetel', 'readwrite'); tx.objectStore('felvetel').put(ertek, kulcs); tx.oncomplete = ok; tx.onerror = function(){ hiba(tx.error); };
  }); });
}
function datumHu(ms){ var n = new Date(ms); return n.getFullYear() + '. ' + HONAP[n.getMonth()] + ' ' + n.getDate() + '.'; }
function hangKartya(){
  var d = el('<div class="hang"><div class="hang-fej"><span class="hang-jel">&#127908;</span><div><b>Előtte és utána</b><span>Hallgasd meg a saját változásodat.</span></div></div><div class="hang-test"><p class="sos-be">Betöltés…</p></div></div>');
  var t = d.querySelector('.hang-test');
  if (!window.indexedDB || !window.MediaRecorder || !navigator.mediaDevices) {
    t.innerHTML = '<p class="sos-be">Ezen a böngészőn nem tudsz hangot felvenni. Nyisd meg az appot Chrome-ban vagy Safariban.</p>';
    return d;
  }
  Promise.all([hangOlvas('elotte'), hangOlvas('utana')]).then(function(f){
    var elo = f[0], uta = f[1];
    t.innerHTML = '';
    function lejatszo(cim, rec){ return el('<div class="hang-sor"><small>' + cim + ' · ' + datumHu(rec.ido) + '</small><audio controls preload="metadata" src="' + URL.createObjectURL(rec.blob) + '"></audio></div>'); }
    function gomb(szoveg, kulcs, osztaly){ var g = el('<button class="gomb ' + (osztaly || '') + '">' + szoveg + '</button>'); g.addEventListener('click', function(){ felvesz(kulcs); }); return g; }
    if (!elo) {
      t.appendChild(el('<p class="sos-be">Ma vedd fel magad egy percben, a 7. napon pedig még egyszer. A végén egymás után meghallgatod a kettőt, és hallod, mennyit változtál.</p>'));
      t.appendChild(el('<div class="figy">A feladat: mutatkozz be egy percben. Ki vagy, mivel foglalkozol, és mit vársz ettől a héttől?</div>'));
      t.appendChild(gomb('&#9679; Felveszem az elsőt', 'elotte', 'voros'));
    } else if (!uta) {
      t.appendChild(lejatszo('Előtte', elo));
      t.appendChild(el('<p class="sos-be">A 7. napon vedd fel ugyanezt még egyszer: ugyanaz a bemutatkozás, egy perc.</p>'));
      t.appendChild(gomb('&#9679; Felveszem a másodikat', 'utana', 'voros'));
      var u = el('<button class="hang-ujra">Újra felveszem az elsőt</button>'); u.addEventListener('click', function(){ felvesz('elotte'); }); t.appendChild(u);
    } else {
      t.appendChild(lejatszo('Előtte', elo)); t.appendChild(lejatszo('Utána', uta));
      t.appendChild(el('<p class="sos-be"><b>Hallod a különbséget?</b> Ezt a változást te csináltad.</p>'));
      var a = ajanlo('o4', 'Hallod még az „ööö”-ket? Öt nap alatt csendre cseréled őket.'); if (a) t.appendChild(a);
      var u2 = el('<button class="hang-ujra">Újra felveszem a másodikat</button>'); u2.addEventListener('click', function(){ felvesz('utana'); }); t.appendChild(u2);
    }
    t.appendChild(el('<p class="hang-titok">A felvételeid csak a telefonodon maradnak, senki más nem hallja őket.</p>'));
  });
  return d;
}
function felvesz(kulcs){
  var t = lapTest(kulcs === 'elotte' ? 'Az első felvétel' : 'A második felvétel');
  t.appendChild(el('<div class="figy">Mutatkozz be egy percben. Ki vagy, mivel foglalkozol, és mit vársz ettől a héttől?</div>'));
  var ora = el('<div class="felv"><span class="felv-pont"></span><b>0:00</b><span>/ 1:00</span></div>');
  var stop = el('<button class="gomb voros">Leállítom</button>');
  t.appendChild(ora); t.appendChild(stop);
  lapNyit('telepit');
  var tipus = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].filter(function(x){ return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(x); })[0];
  navigator.mediaDevices.getUserMedia({audio: true}).then(function(folyam){
    var rec = new MediaRecorder(folyam, tipus ? {mimeType: tipus} : undefined), darabok = [], kezd = Date.now(), idozito;
    rec.ondataavailable = function(e){ if (e.data && e.data.size) darabok.push(e.data); };
    rec.onstop = function(){
      clearInterval(idozito); folyam.getTracks().forEach(function(s){ s.stop(); });
      var blob = new Blob(darabok, {type: rec.mimeType || tipus || 'audio/webm'});
      hangIr(kulcs, {blob: blob, ido: Date.now()}).then(function(){
        uzen(kulcs === 'elotte' ? 'Elmentve. A 7. napon találkozunk!' : 'Elmentve. Hallgasd meg a kettőt egymás után!');
        history.state && history.state.lap ? history.back() : lapZar(); rajzol();
      }, function(){ uzen('Nem sikerült elmenteni. Próbáld újra.'); });
    };
    rec.start(1000);
    idozito = setInterval(function(){
      var mp = Math.floor((Date.now() - kezd) / 1000);
      ora.querySelector('b').textContent = Math.floor(mp / 60) + ':' + ('0' + mp % 60).slice(-2);
      if (mp >= 60 && rec.state === 'recording') rec.stop();
    }, 250);
    stop.addEventListener('click', function(){ if (rec.state === 'recording') rec.stop(); });
    document.querySelectorAll('#telepit [data-zar]').forEach(function(b){ b.addEventListener('click', function(){ if (rec.state === 'recording') { darabok = []; rec.onstop = function(){ clearInterval(idozito); folyam.getTracks().forEach(function(s){ s.stop(); }); }; rec.stop(); } }, {once: true}); });
  }, function(){
    t.innerHTML = '<p class="sos-be">Nem kaptunk hozzáférést a mikrofonhoz. Engedélyezd a mikrofont a böngésző beállításaiban, és próbáld újra.</p>';
  });
}

/* ---------- SOS: négyzetes légzés + mentőanyagok (03/11) ---------- */
function lapTest(cim){
  document.querySelector('#telepit .lap-fej b').textContent = cim;
  var t = document.getElementById('telepit-test'); t.innerHTML = ''; return t;
}
function sosNyit(fo){
  var t = lapTest('SOS: hamarosan beszélsz');
  t.appendChild(el('<p class="sos-be">Csináld végig velem: négyzetes légzés, három kör, kevesebb mint egy perc.</p>'));
  var kor = el('<div class="legzes"><div class="kor"><b>4</b><span>Indulhatunk?</span></div></div>');
  var gomb = el('<button class="gomb voros">Indítom</button>');
  t.appendChild(kor); t.appendChild(gomb);
  var FAZIS = [['Szívd be', 'be'], ['Tartsd bent', 'tart'], ['Fújd ki', 'ki'], ['Pihenj', 'pihen']];
  var szam = kor.querySelector('b'), felirat = kor.querySelector('span'), k = kor.querySelector('.kor');
  gomb.addEventListener('click', function(){
    gomb.disabled = true; gomb.textContent = 'Lélegezz velem…';
    var lepes = 0, ossz = 3 * 4 * 4;
    (function tik(){
      if (document.getElementById('telepit').hidden) return;
      if (lepes >= ossz) {
        k.className = 'kor'; szam.textContent = '✓'; felirat.textContent = 'Kész';
        gomb.disabled = false; gomb.textContent = 'Még egyszer';
        uzen('Vállak le, talp a földön. Most mondd ki az első mondatodat.');
        return;
      }
      var f = FAZIS[Math.floor(lepes / 4) % 4];
      k.className = 'kor ' + f[1]; felirat.textContent = f[0]; szam.textContent = 4 - lepes % 4;
      lepes++; setTimeout(tik, 1000);
    })();
  });
  t.appendChild(el('<p class="sos-be" style="margin-top:22px">Ha kell még:</p>'));
  fo.anyagok.filter(function(e){ return /Lámpaláz|Mit mondj/.test(e.cim); }).forEach(function(e){ t.appendChild(elemGomb(e)); });
  lapNyit('telepit');
}

/* ---------- tanúsítvány a 15. videó után (03/11) ---------- */
var HONAP = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];
function tanusitvanyKartya(kesz_db, osszes_db){
  if (kesz_db < osszes_db) {
    return el('<div class="tanus zart"><span class="tanus-jel">&#9733;</span><div><b>Névre szóló tanúsítvány</b>' +
      '<p>Ha mind a ' + osszes_db + ' videót késznek jelölöd, itt megkapod. Még ' + (osszes_db - kesz_db) + ' van hátra.</p></div></div>');
  }
  var d = el('<div class="tanus"><span class="tanus-jel">&#9733;</span><div><b>Végigcsináltad a 7 napot!</b>' +
    '<p>Írd be a neved, és elkészítjük a tanúsítványodat.</p>' +
    '<input type="text" autocomplete="name" maxlength="40" placeholder="A neved">' +
    '<button class="gomb">Elkészítem a tanúsítványt</button></div></div>');
  var inp = d.querySelector('input'); inp.value = olvas('bh-nev', '');
  d.querySelector('button').addEventListener('click', function(){
    var nev = inp.value.trim();
    if (!nev) { uzen('Írd be a neved.'); inp.focus(); return; }
    ir('bh-nev', nev); tanusitvany(nev, osszes_db);
  });
  return d;
}
function tanusitvany(nev, osszes_db){
  var t = lapTest('A tanúsítványod');
  t.appendChild(el('<p class="sos-be">Készül…</p>'));
  lapNyit('telepit');
  var betuk = document.fonts ? Promise.all(['800 60px "Barlow Condensed"', '600 30px Inter', '400 30px Inter'].map(function(f){ return document.fonts.load(f); })) : Promise.resolve();
  betuk.catch(function(){}).then(function(){
    var W = 1600, H = 1130, c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d'), ARANY = '#D8A93C';
    var g = x.createRadialGradient(W / 2, 0, 80, W / 2, H / 2, W * .75); g.addColorStop(0, '#3A1418'); g.addColorStop(1, '#16110F');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = ARANY; x.lineWidth = 6; x.strokeRect(40, 40, W - 80, H - 80);
    x.lineWidth = 2; x.strokeRect(62, 62, W - 124, H - 124);
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    function sor(szoveg, font, szin, y){ x.font = font; x.fillStyle = szin; x.fillText(szoveg, W / 2, y); }
    sor('BÁTOR HANG · 7 NAPOS PROGRAM', '600 30px Inter', ARANY, 170);
    sor('TANÚSÍTVÁNY', '800 130px "Barlow Condensed"', '#FFFFFF', 320);
    sor('Ez a tanúsítvány igazolja, hogy', '400 34px Inter', '#E8DCCB', 420);
    var meret = 110; x.font = '800 ' + meret + 'px "Barlow Condensed"';
    while (x.measureText(nev).width > W - 260 && meret > 50) { meret -= 6; x.font = '800 ' + meret + 'px "Barlow Condensed"'; }
    sor(nev, '800 ' + meret + 'px "Barlow Condensed"', ARANY, 560);
    x.fillStyle = ARANY; x.fillRect(W / 2 - 260, 600, 520, 3);
    sor('elvégezte a Bátor Hang 7 napos programját:', '400 34px Inter', '#E8DCCB', 680);
    sor(osszes_db + ' videólecke és 7 nap gyakorlás a magabiztos beszédért.', '400 34px Inter', '#E8DCCB', 730);
    var n = new Date();
    sor(n.getFullYear() + '. ' + HONAP[n.getMonth()] + ' ' + n.getDate() + '.', '600 32px Inter', '#FFFFFF', 880);
    sor('★ ★ ★', '400 34px Inter', ARANY, 960);
    c.toBlob(function(blob){
      var url = URL.createObjectURL(blob), fajl = 'Bator Hang tanusitvany.png';
      t.innerHTML = '';
      t.appendChild(el('<img class="tanus-kep" alt="A tanúsítványod" src="' + url + '">'));
      var le = el('<a class="gomb" download="' + fajl + '" href="' + url + '">Letöltöm</a>');
      t.appendChild(le);
      var f = window.File ? new File([blob], fajl, {type: 'image/png'}) : null;
      if (f && navigator.canShare && navigator.canShare({files: [f]})) {
        var m = el('<button class="gomb masod" style="margin-top:10px">Megosztom</button>');
        m.addEventListener('click', function(){ navigator.share({files: [f], title: 'Bátor Hang tanúsítvány'}).catch(function(){}); });
        t.appendChild(m);
      }
      t.appendChild(el('<p class="sos-be" style="margin-top:16px">Gratulálunk! Ezt a hetet te csináltad végig.</p>'));
      var kov = [['o2', 'Ne álljon meg itt: gyakorolj tovább éles helyzeteket a telefonodon, bármikor.'],
                 ['o3', 'Megvan a hangod. Most használd arra, hogy kapcsolatokat építs.'],
                 ['o5', 'Készen állsz a következő színpadra: a kamerára.']];
      for (var i = 0; i < kov.length; i++) { var a = ajanlo(kov[i][0], kov[i][1]); if (a) { t.appendChild(a); break; } }
    }, 'image/png');
  });
}

/* ---------- rajzolás ---------- */
function termekKartya(p){
  var nyitott = !!tartalom[p.id];
  var d = el('<div class="termek' + (nyitott ? '' : ' zart') + '"><div class="kep"><img src="' + p.kep + '" alt="" loading="lazy" width="600" height="800">' +
    '<span class="cimke">' + (nyitott ? 'A tiéd' : 'Zárolva') + '</span>' + (nyitott ? '' : akcioSor(p)) + (nyitott ? '' : '<span class="lakat"><i>' + LAKAT + '</i></span>') + '</div>' +
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
    if (p.belul) {
      var bn = el('<button class="gomb masod belenez">Belenézek</button>');
      bn.addEventListener('click', function(){ belenez(p); });
      tt.appendChild(bn);
    }
    tt.appendChild(el('<a class="gomb voros" href="' + vasarLink(p) + '" target="_blank" rel="noopener">Megszerzem' + akcioJel(p) + '</a>'));
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

  var sos = el('<button class="sos-sav"><span class="sos-jel">SOS</span><span><b>Mindjárt beszélnem kell</b><span>Egy perc légzés és a mentőmondatok</span></span><span class="nyil">&#8250;</span></button>');
  sos.addEventListener('click', function(){ sosNyit(fo); });
  app.appendChild(sos);
  app.appendChild(hangKartya());

  if (!telepitve()) {
    var s = el('<button class="tel-sav"><span><b>Tedd ki a telefonodra</b><span>Így egy koppintással eléred, mint egy alkalmazást.</span></span><span class="nyil">&#8250;</span></button>');
    s.addEventListener('click', function(){ document.querySelector('#telepit .lap-fej b').textContent = 'Tedd ki a telefonodra'; utmutato(iphone() ? 'ios' : 'and'); lapNyit('telepit'); });
    app.appendChild(s);
  }

  app.appendChild(el('<div class="szakasz"><h2>A programod</h2><p>15 videólecke magyarul, 7 napra beosztva.</p></div>'));
  var elsoNyitott = false, utolsoHely = null;
  fo.napok.forEach(function(n){
    var mind = n.elemek.every(function(e){ return kesz[e.id]; });
    var nyitva = !mind && !elsoNyitott; if (nyitva) elsoNyitott = true;
    var d = el('<div class="nap' + (mind ? ' kesz' : '') + (nyitva ? ' nyitva' : '') + '"><button><span class="szam">' + (mind ? '&#10003;' : esc(n.szam)) + '</span>' +
      '<span class="nc"><b>' + esc(n.cim) + '</b><span>' + n.elemek.length + ' videó</span></span><span class="le">&#9662;</span></button><ul></ul></div>');
    d.querySelector('button').addEventListener('click', function(){ d.classList.toggle('nyitva'); });
    var ul = d.querySelector('ul');
    n.elemek.forEach(function(e){ var li = document.createElement('li'); li.appendChild(elemGomb(e)); ul.appendChild(li); });
    app.appendChild(d);
    // a legutóbb befejezett nap ajánlata (csak egy, és csak ha még nincs meg neki)
    if (mind && UTANA[n.szam]) { var a = ajanlo(UTANA[n.szam][0], UTANA[n.szam][1]); if (a) utolsoHely = [d, a]; }
  });
  if (utolsoHely) utolsoHely[0].after(utolsoHely[1]);

  app.appendChild(tanusitvanyKartya(megnezett, osszes.length));

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
