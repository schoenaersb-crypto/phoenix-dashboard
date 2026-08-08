/* ══ CLÔTURE DU SOIR PAR PHOTO ══════════════════════
   Bastien photographie le ticket Z, le backend le lit (Gemini),
   l'écran montre ce qui a été lu, chaque champ se corrige au doigt,
   et RIEN ne s'écrit avant sa confirmation. La photo est conservée
   sur Drive pour pouvoir remonter à la source. Toute date ici est
   une date de SERVICE (coupure à 5 h du matin), jamais la date civile. */
var CLO_CAP = null;
function cloJourService(){
  var d = new Date(Date.now() - 5 * 3600 * 1000);   /* avant 5 h : encore le service de la veille */
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function clotureBloc(){
  return '<div class="card" id="cloCard" style="margin-bottom:12px">'
    + '<div class="card-label">Clôture du soir</div>'
    + '<div class="row-meta" style="margin-bottom:10px">'
    +   'Photographie le ticket Z de fin de service. Tu vérifies chaque chiffre avant enregistrement.'
    + '</div>'
    + '<input type="file" id="cloFile" accept="image/*" capture="environment" style="display:none">'
    + '<div class="resa-act">'
    +   '<button class="rbtn" id="cloBtn">Photographier le Z</button>'
    + '</div>'
    + '<div class="rmsg" id="cloMsg" style="text-align:left"></div>'
    + '<div id="cloList"></div>'
    + '</div>';
}
function clotureLire(file){
  var msg = el('cloMsg');
  el('cloList').innerHTML = '';
  var t0 = Date.now(), etape = 'Préparation de la photo…', horloge = null, fini = false;
  function peins(){
    if(fini) return;
    var s = Math.round((Date.now() - t0) / 1000);
    msg.textContent = etape + (s >= 2 ? '  ' + s + ' s' : '')
      + (s >= 12 ? ' — la lecture d’un ticket chargé prend parfois vingt secondes.' : '');
  }
  function arrete(texte){ fini = true; if(horloge) clearInterval(horloge); msg.textContent = texte; }
  peins();
  horloge = setInterval(peins, 1000);
  var fr = new FileReader();
  fr.onerror = function(){ arrete('Fichier illisible.'); };
  fr.onload = function(){
    var img = new Image();
    img.onerror = function(){ arrete('Ce fichier n’est pas une image.'); };
    img.onload = function(){
      var max = 1200, w = img.width, ht = img.height;
      if(Math.max(w, ht) > max){ var k = max / Math.max(w, ht); w = Math.round(w*k); ht = Math.round(ht*k); }
      var c = document.createElement('canvas');
      c.width = w; c.height = ht;
      c.getContext('2d').drawImage(img, 0, 0, w, ht);
      var data;
      try { data = c.toDataURL('image/jpeg', 0.78).split(',')[1]; }
      catch(e){ arrete('Conversion impossible : ' + e.message); return; }
      etape = 'Envoi et lecture du ticket…'; peins();
      fetch(API, { method:'POST', cache:'no-store',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify({ action:'cloture_photo', code: ADMIN, image: data, mime:'image/jpeg' }) })
        .then(function(x){ return x.json(); })
        .then(function(j){
          if(!j || j.ok === false){
            var er = (j && j.error) || 'inconnu';
            if(/action|inconnu/i.test(er)) arrete('Le backend ne connaît pas encore la clôture — le module Code.gs est à coller (je l’ai préparé).');
            else arrete('Échec : ' + er);
            return;
          }
          fini = true; if(horloge) clearInterval(horloge);
          CLO_CAP = j;
          clotureAffiche();
        })
        .catch(function(e){ arrete('Réseau : ' + e.message); });
    };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}
function cloNum(v){ var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? 0 : n; }
function cloDateOk(s){
  s = String(s || '');
  if(s.length !== 10 || s.charAt(4) !== '-' || s.charAt(7) !== '-') return false;
  for(var i = 0; i < 10; i++){
    if(i === 4 || i === 7) continue;
    if(s.charAt(i) < '0' || s.charAt(i) > '9') return false;
  }
  return true;
}
function clotureEcart(){
  var t = cloNum(el('cloTtc').value), e = cloNum(el('cloEsp').value), cb = cloNum(el('cloCb').value);
  var ec = Math.round((t - e - cb) * 100) / 100;
  var box = el('cloEc');
  if(!box) return;
  if(!t && !e && !cb){ box.textContent = ''; return; }
  box.textContent = ec === 0 ? '✓ espèces + carte = TTC'
    : 'écart de ' + ec.toFixed(2).replace('.', ',') + ' € entre le TTC et espèces + carte';
  box.style.color = ec === 0 ? 'var(--ok, #2c7)' : '';
}
function clotureAffiche(){
  var j = CLO_CAP;
  if(!j) return;
  var l = j.lecture || {};
  var msg = el('cloMsg'), list = el('cloList');
  msg.textContent = 'Voilà ce que j’ai lu — corrige ce qui cloche, rien n’est encore enregistré.';
  function champ(id, lab, val, mode){
    return '<label class="caprow" style="display:flex;align-items:center;gap:8px">'
      + '<span class="cap-n" style="min-width:110px">' + lab + '</span>'
      + '<input class="f-input" id="' + id + '" inputmode="' + (mode||'decimal') + '" value="' + esc(val == null ? '' : String(val)) + '" style="flex:1">'
      + '</label>';
  }
  var h = champ('cloDate', 'Jour de service', l.date || cloJourService(), 'numeric')
    + champ('cloTtc', 'Total TTC (€)', l.ttc)
    + champ('cloEsp', 'Espèces (€)', l.especes)
    + champ('cloCb', 'Carte (€)', l.carte)
    + champ('cloCvt', 'Couverts', l.couverts, 'numeric')
    + '<div class="row-meta" id="cloEc" style="margin-top:6px"></div>'
    + (l.produits && l.produits.length ? '<div class="row-meta" style="margin-top:4px">' + l.produits.length + ' lignes de produits lues — elles partent avec la clôture.</div>' : '')
    + '<div class="resa-act" style="margin-top:10px">'
    + '<button class="rbtn ghost" id="cloVide">Laisser tomber</button>'
    + '<button class="rbtn" id="cloGo">Enregistrer la clôture</button></div>';
  list.innerHTML = h;
  /* chaque frappe est recopiée dans CLO_CAP : le rafraîchissement
     automatique du dashboard redessine ce formulaire, et sans cela il
     écraserait les corrections en cours par la lecture d'origine */
  [['cloDate','date'],['cloTtc','ttc'],['cloEsp','especes'],['cloCb','carte'],['cloCvt','couverts']].forEach(function(p2){
    el(p2[0]).addEventListener('input', function(){
      CLO_CAP.lecture[p2[1]] = el(p2[0]).value;
      clotureEcart();
    });
  });
  clotureEcart();
  el('cloGo').addEventListener('click', clotureValide);
  el('cloVide').addEventListener('click', clotureRaz);
}
function clotureRaz(){
  CLO_CAP = null;
  var l = el('cloList'), m = el('cloMsg'), f = el('cloFile');
  if(l) l.innerHTML = '';
  if(m) m.textContent = '';
  if(f) f.value = '';
}
function clotureValide(){
  var j = CLO_CAP;
  if(!j) return;
  var msg = el('cloMsg');
  var corps = {
    action: 'cloture_valide', code: ADMIN,
    cloture: {
      date: el('cloDate').value.trim(),
      ttc: cloNum(el('cloTtc').value),
      especes: cloNum(el('cloEsp').value),
      carte: cloNum(el('cloCb').value),
      couverts: Math.round(cloNum(el('cloCvt').value)) || null,
      produits: (j.lecture && j.lecture.produits) || [],
      photoId: j.photoId || ''
    }
  };
  if(!cloDateOk(corps.cloture.date)){ msg.textContent = 'La date doit être AAAA-MM-JJ.'; return; }
  if(!corps.cloture.ttc){ msg.textContent = 'Le total TTC manque.'; return; }
  var go = el('cloGo'); if(go) go.disabled = true;
  msg.textContent = 'Enregistrement…';
  fetch(API, { method:'POST', cache:'no-store',
    headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(corps) })
    .then(function(x){ return x.json(); })
    .then(function(r){
      if(!r || r.ok === false){ if(go) go.disabled = false; msg.textContent = 'Échec : ' + ((r&&r.error)||'inconnu'); return; }
      var rp = r.rapprochement || {};
      var tx = 'Clôture du ' + corps.cloture.date + ' enregistrée.';
      if(rp.carteBanque != null){
        tx += ' Carte selon banque : ' + Number(rp.carteBanque).toFixed(2).replace('.', ',') + ' €'
           + ' · écart du jour ' + Number(rp.ecart || 0).toFixed(2).replace('.', ',') + ' €'
           + (rp.apresMinuit ? ' (dont ' + Number(rp.apresMinuit).toFixed(2).replace('.', ',') + ' € après minuit)' : '') + '.';
      }
      msg.textContent = tx;
      el('cloList').innerHTML = '';
      CLO_CAP = null;
      setTimeout(load, 1200);
    })
    .catch(function(e){ if(go) go.disabled = false; msg.textContent = 'Réseau : ' + e.message; });
}
function clotureBind(){
  var b = el('cloBtn'), f = el('cloFile');
  if(!b || !f) return;
  b.addEventListener('click', function(){ f.click(); });
  f.addEventListener('change', function(){
    if(f.files && f.files[0]) clotureLire(f.files[0]);
  });
  if(CLO_CAP) clotureAffiche();
}

