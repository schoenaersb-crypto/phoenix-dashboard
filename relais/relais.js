/* Phoenix Relais 3.0 — Brasserie Phoenix
   Remplace PhoenixRelais.exe 2.x a la meme adresse (port 8123) et avec le meme config.json.
   - sert la caisse a jour (copie de GitHub, gardee en secours si internet tombe)
   - imprime cuisine / bar / caisse sur les imprimantes reseau (port 9100)
   - partage les tables entre appareils (phoenix-etat.json)
   Aucune dependance : Node seul. */
'use strict';
const http = require('http'), https = require('https'), net = require('net'), fs = require('fs'),
      path = require('path'), os = require('os');

const VERSION = '3.0';
const ICI = process.pkg || process.execPath.toLowerCase().endsWith('phoenixrelais.exe')
  ? path.dirname(process.execPath) : __dirname;
const F_CONFIG = path.join(ICI, 'config.json');
const F_ETAT = path.join(ICI, 'phoenix-etat.json');
const F_JOURNAL = path.join(ICI, 'phoenix-relais-journal.txt');
const CACHE = path.join(ICI, 'appli-a-jour');
const SITE = 'https://schoenaersb-crypto.github.io/phoenix-dashboard/';
try { fs.mkdirSync(CACHE, { recursive: true }); } catch (e) {}

const DERNIERES = [];
function log(...a) {
  const l = new Date().toLocaleString('fr-FR') + '  ' + a.join(' ');
  console.log(l);
  DERNIERES.unshift(l); if (DERNIERES.length > 40) DERNIERES.pop();
  try { fs.appendFileSync(F_JOURNAL, l + '\r\n'); } catch (e) {}
}
function litJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } }
function ecritJson(f, o) { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(o)); fs.renameSync(t, f); }

/* ───────── réglages (même format que la 2.x) ───────── */
const DEFAUT = {
  port: 8123,
  imprimantes: { cuisine: { ip: '192.168.18.100', port: 9100 }, bar: { ip: '192.168.18.102', port: 9100 }, caisse: { alias: 'bar' } },
  codepage: 19, encodage: 'cp858', colonnes: 48, coupe: true
};
const CFG = Object.assign({}, DEFAUT, litJson(F_CONFIG, {}));
CFG.imprimantes = Object.assign({}, DEFAUT.imprimantes, CFG.imprimantes || {});
/* La 2.x avait « codepage 2 + cp858 » : la page 2 (PC850) n'a pas le €, l'octet
   envoyé sortait en « ı ». On garde l'encodage de la page choisie, et le € s'écrit
   « EUR » quand la page ne l'a pas. */
const PAGE_ENC = { 19: 'cp858', 2: 'cp850', 16: 'cp1252', 0: 'cp437' };
const ENC = PAGE_ENC[CFG.codepage] || ({ win1252: 'cp1252' }[CFG.encodage] || CFG.encodage || 'cp858');

/* ───────── impression ───────── */
const TABLES = {"cp858":{"199":128,"252":129,"233":130,"226":131,"228":132,"224":133,"229":134,"231":135,"234":136,"235":137,"232":138,"239":139,"238":140,"236":141,"196":142,"197":143,"201":144,"230":145,"198":146,"244":147,"246":148,"242":149,"251":150,"249":151,"255":152,"214":153,"220":154,"248":155,"163":156,"216":157,"215":158,"402":159,"225":160,"237":161,"243":162,"250":163,"241":164,"209":165,"170":166,"186":167,"191":168,"174":169,"172":170,"189":171,"188":172,"161":173,"171":174,"187":175,"9617":176,"9618":177,"9619":178,"9474":179,"9508":180,"193":181,"194":182,"192":183,"169":184,"9571":185,"9553":186,"9559":187,"9565":188,"162":189,"165":190,"9488":191,"9492":192,"9524":193,"9516":194,"9500":195,"9472":196,"9532":197,"227":198,"195":199,"9562":200,"9556":201,"9577":202,"9574":203,"9568":204,"9552":205,"9580":206,"164":207,"240":208,"208":209,"202":210,"203":211,"200":212,"8364":213,"205":214,"206":215,"207":216,"9496":217,"9484":218,"9608":219,"9604":220,"166":221,"204":222,"9600":223,"211":224,"223":225,"212":226,"210":227,"245":228,"213":229,"181":230,"254":231,"222":232,"218":233,"219":234,"217":235,"253":236,"221":237,"175":238,"180":239,"173":240,"177":241,"8215":242,"190":243,"182":244,"167":245,"247":246,"184":247,"176":248,"168":249,"183":250,"185":251,"179":252,"178":253,"9632":254,"160":255},"cp850":{"199":128,"252":129,"233":130,"226":131,"228":132,"224":133,"229":134,"231":135,"234":136,"235":137,"232":138,"239":139,"238":140,"236":141,"196":142,"197":143,"201":144,"230":145,"198":146,"244":147,"246":148,"242":149,"251":150,"249":151,"255":152,"214":153,"220":154,"248":155,"163":156,"216":157,"215":158,"402":159,"225":160,"237":161,"243":162,"250":163,"241":164,"209":165,"170":166,"186":167,"191":168,"174":169,"172":170,"189":171,"188":172,"161":173,"171":174,"187":175,"9617":176,"9618":177,"9619":178,"9474":179,"9508":180,"193":181,"194":182,"192":183,"169":184,"9571":185,"9553":186,"9559":187,"9565":188,"162":189,"165":190,"9488":191,"9492":192,"9524":193,"9516":194,"9500":195,"9472":196,"9532":197,"227":198,"195":199,"9562":200,"9556":201,"9577":202,"9574":203,"9568":204,"9552":205,"9580":206,"164":207,"240":208,"208":209,"202":210,"203":211,"200":212,"305":213,"205":214,"206":215,"207":216,"9496":217,"9484":218,"9608":219,"9604":220,"166":221,"204":222,"9600":223,"211":224,"223":225,"212":226,"210":227,"245":228,"213":229,"181":230,"254":231,"222":232,"218":233,"219":234,"217":235,"253":236,"221":237,"175":238,"180":239,"173":240,"177":241,"8215":242,"190":243,"182":244,"167":245,"247":246,"184":247,"176":248,"168":249,"183":250,"185":251,"179":252,"178":253,"9632":254,"160":255},"cp437":{"199":128,"252":129,"233":130,"226":131,"228":132,"224":133,"229":134,"231":135,"234":136,"235":137,"232":138,"239":139,"238":140,"236":141,"196":142,"197":143,"201":144,"230":145,"198":146,"244":147,"246":148,"242":149,"251":150,"249":151,"255":152,"214":153,"220":154,"162":155,"163":156,"165":157,"8359":158,"402":159,"225":160,"237":161,"243":162,"250":163,"241":164,"209":165,"170":166,"186":167,"191":168,"8976":169,"172":170,"189":171,"188":172,"161":173,"171":174,"187":175,"9617":176,"9618":177,"9619":178,"9474":179,"9508":180,"9569":181,"9570":182,"9558":183,"9557":184,"9571":185,"9553":186,"9559":187,"9565":188,"9564":189,"9563":190,"9488":191,"9492":192,"9524":193,"9516":194,"9500":195,"9472":196,"9532":197,"9566":198,"9567":199,"9562":200,"9556":201,"9577":202,"9574":203,"9568":204,"9552":205,"9580":206,"9575":207,"9576":208,"9572":209,"9573":210,"9561":211,"9560":212,"9554":213,"9555":214,"9579":215,"9578":216,"9496":217,"9484":218,"9608":219,"9604":220,"9612":221,"9616":222,"9600":223,"945":224,"223":225,"915":226,"960":227,"931":228,"963":229,"181":230,"964":231,"934":232,"920":233,"937":234,"948":235,"8734":236,"966":237,"949":238,"8745":239,"8801":240,"177":241,"8805":242,"8804":243,"8992":244,"8993":245,"247":246,"8776":247,"176":248,"8729":249,"183":250,"8730":251,"8319":252,"178":253,"9632":254,"160":255},"cp1252":{"8364":128,"8218":130,"402":131,"8222":132,"8230":133,"8224":134,"8225":135,"710":136,"8240":137,"352":138,"8249":139,"338":140,"381":142,"8216":145,"8217":146,"8220":147,"8221":148,"8226":149,"8211":150,"8212":151,"732":152,"8482":153,"353":154,"8250":155,"339":156,"382":158,"376":159,"160":160,"161":161,"162":162,"163":163,"164":164,"165":165,"166":166,"167":167,"168":168,"169":169,"170":170,"171":171,"172":172,"173":173,"174":174,"175":175,"176":176,"177":177,"178":178,"179":179,"180":180,"181":181,"182":182,"183":183,"184":184,"185":185,"186":186,"187":187,"188":188,"189":189,"190":190,"191":191,"192":192,"193":193,"194":194,"195":195,"196":196,"197":197,"198":198,"199":199,"200":200,"201":201,"202":202,"203":203,"204":204,"205":205,"206":206,"207":207,"208":208,"209":209,"210":210,"211":211,"212":212,"213":213,"214":214,"215":215,"216":216,"217":217,"218":218,"219":219,"220":220,"221":221,"222":222,"223":223,"224":224,"225":225,"226":226,"227":227,"228":228,"229":229,"230":230,"231":231,"232":232,"233":233,"234":234,"235":235,"236":236,"237":237,"238":238,"239":239,"240":240,"241":241,"242":242,"243":243,"244":244,"245":245,"246":246,"247":247,"248":248,"249":249,"250":250,"251":251,"252":252,"253":253,"254":254,"255":255}};
const REMPLACE = { '—': '-', '–': '-', '’': "'", '‘': "'", '“': '"', '”': '"',
  '…': '...', ' ': ' ', ' ': ' ', '•': '*', '→': '>', '×': 'x',
  'œ': 'oe', 'Œ': 'OE', 'æ': 'ae', 'Æ': 'AE', '−': '-', '✓': 'OK' };
function encode(s, enc) {
  const T = TABLES[enc] || TABLES.cp858, out = [];
  for (const ch of s) {
    const c = REMPLACE[ch] !== undefined ? REMPLACE[ch] : ch;
    for (const x of c) {
      const k = x.codePointAt(0);
      if (k < 128) out.push(k);
      else if (T[k] !== undefined) out.push(T[k]);
      else if (k === 0x20ac) out.push(69, 85, 82);            // € absent de la page : EUR
      else {
        const sans = x.normalize('NFD').replace(/[̀-ͯ]/g, '');
        out.push(sans.charCodeAt(0) < 128 ? sans.charCodeAt(0) : 63);
      }
    }
  }
  return out;
}
function resoud(dest, vu) {
  vu = vu || {};
  const p = CFG.imprimantes[dest];
  if (!p || vu[dest]) return null;
  vu[dest] = 1;
  if (p.alias) { const r = resoud(p.alias, vu); return r && Object.assign({ nom: p.alias }, r); }
  return Object.assign({ nom: dest }, p);
}
const TAILLE = { 1: 0x00, 2: 0x01, 3: 0x11 };
/* QR natif ESC/POS (GS ( k) : l'imprimante génère le code elle-même.
   Une ligne « [[QR:adresse]] » dans le texte est centrée et imprimée en QR. */
function qrOctets(url) {
  const d = Buffer.from(String(url), 'latin1'), n = d.length + 3;
  return [0x1b, 0x61, 0x01,
    0x1d, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00,   // modèle 2
    0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x43, 6,            // taille du module
    0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31,         // correction M
    0x1d, 0x28, 0x6b, n & 0xff, (n >> 8) & 0xff, 0x31, 0x50, 0x30, ...d, // stocker
    0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30,         // imprimer
    0x0a, 0x1b, 0x61, 0x00];
}
function versOctets(texte, imp, dest) {
  const gros = dest === 'cuisine' || dest === 'bar';
  const taille = imp.taille || (gros ? 2 : 1), gras = imp.gras !== undefined ? !!imp.gras : gros;
  const o = [0x1b, 0x40, 0x1b, 0x74, CFG.codepage & 0xff];
  const lignes = String(texte).split('\n');
  if (!String(texte).trim()) return Buffer.from(o.concat([0x1b, 0x70, 0x00, 0x19, 0xfa])); // tiroir
  for (let l of lignes) {
    const qm = /^\[\[QR:(.+)\]\]$/.exec(l);
    if (qm) { o.push(...qrOctets(qm[1])); continue; }
    let t = TAILLE[taille] || 0, g = gras;
    if (l[0] === '\u0001') { t = 0x11; g = true; l = l.slice(1); }
    else if (l[0] === '\u0002') { t = 0x01; g = true; l = l.slice(1); }
    o.push(0x1d, 0x21, t, 0x1b, 0x45, g ? 1 : 0);
    o.push(...encode(l, ENC), 0x0a);
  }
  o.push(0x1d, 0x21, 0, 0x1b, 0x45, 0, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a);
  if (CFG.coupe !== false) o.push(0x1d, 0x56, 0x42, 0x00);
  return Buffer.from(o);
}
function envoieTCP(ip, port, data) {
  return new Promise((ok, ko) => {
    const s = net.createConnection({ host: ip, port: port || 9100 });
    const m = setTimeout(() => { s.destroy(); ko(new Error('délai dépassé (' + ip + ')')); }, 7000);
    s.on('connect', () => s.end(data));
    s.on('close', () => { clearTimeout(m); ok(); });
    s.on('error', e => { clearTimeout(m); ko(e); });
  });
}
async function imprime(dest, texte) {
  const imp = resoud(dest) || resoud('caisse') || resoud('bar') || resoud('cuisine');
  if (!imp || !imp.ip) throw new Error('destination inconnue : ' + dest);
  const data = versOctets(texte, imp, dest);
  await envoieTCP(imp.ip, imp.port, data);
  log('imprimé', dest, '->', imp.nom, imp.ip, data.length + ' octets');
}
function ticketCalibrage() {
  const l = '\u0002PREPARATION eeacu 6,50 E';
  const pages = [[19, 'cp858', 'A'], [2, 'cp850', 'B'], [16, 'cp1252', 'C'], [0, 'cp437', 'D']];
  const o = [0x1b, 0x40];
  const ligne = (s, enc) => o.push(...encode(s, enc), 0x0a);
  ligne('PHOENIX - CALIBRAGE', 'cp437');
  ligne('La bonne ligne = accents corrects :', 'cp437');
  for (const [cp, enc, n] of pages) { o.push(0x1b, 0x74, cp); ligne(n + '  PRÉPARATION éèàçù 6,50 €', enc); }
  o.push(0x1b, 0x74, 0);
  ligne('Largeur du papier :', 'cp437');
  ligne('         1         2         3         4', 'cp437');
  ligne('123456789012345678901234567890123456789012345678', 'cp437');
  ligne('Dire a Claude quelle ligne est bonne : A, B, C ou D', 'cp437');
  o.push(0x0a, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00);
  void l; return Buffer.from(o);
}

/* ───────── partage des tables ───────── */
function etatVide(gen) { return { v: 1, gen: gen || 0, jour: '', tables: {}, tombes: {}, tickets: [], ventes: [], journal: [], rupture: {}, ruptureTs: 0 }; }
let ETAT = Object.assign(etatVide(), litJson(F_ETAT, {}));
['tables', 'tombes', 'rupture'].forEach(k => { if (!ETAT[k] || typeof ETAT[k] !== 'object') ETAT[k] = {}; });
['tickets', 'ventes', 'journal'].forEach(k => { if (!Array.isArray(ETAT[k])) ETAT[k] = []; });
if (typeof ETAT.v !== 'number') ETAT.v = 1;
if (typeof ETAT.gen !== 'number') ETAT.gen = 0;
function ecrisEtat() { try { ecritJson(F_ETAT, ETAT); } catch (e) { log('ECHEC écriture état :', e.message); } }
const clef = e => [e.ts, e.qui, e.type, e.detail, e.montant].join('|');
function appliqueMaj(d) {
  if (d.z) {
    ETAT = etatVide(Date.now() % 2147483647);
    ETAT.v = (Date.now() % 1000000000) + 1;
    ecrisEtat(); log('Z : journée commune remise à zéro');
    return { v: ETAT.v, gen: ETAT.gen };
  }
  const avant = JSON.stringify(Object.assign({}, ETAT, { v: 0 }));
  const occupe = ETAT.ventes.length || Object.keys(ETAT.tables).length;
  if (d.jour && ETAT.jour && d.jour !== ETAT.jour && occupe) return { v: ETAT.v, gen: ETAT.gen };
  if (d.jour && !ETAT.jour) ETAT.jour = d.jour;
  for (const r in (d.tables || {})) {
    const t = d.tables[r], loc = ETAT.tables[r], mod = t.mod || 0, tombe = ETAT.tombes[r] || 0;
    if (tombe && tombe >= Math.max(t.ts || 0, mod)) continue;
    if (!loc || mod >= (loc.mod || 0)) ETAT.tables[r] = t;
  }
  for (const r in (d.supprime || {})) { delete ETAT.tables[r]; ETAT.tombes[r] = Math.max(d.supprime[r] || 0, ETAT.tombes[r] || 0); }
  const ids = new Set(ETAT.tickets.map(k => k.id));
  (d.tickets || []).forEach(k => { if (!ids.has(k.id)) { ETAT.tickets.push(k); ids.add(k.id); } });
  const faits = new Set(d.ticketsFait || []);
  ETAT.tickets.forEach(k => { if (faits.has(k.id)) k.fait = true; });
  const nos = new Set(ETAT.ventes.map(v => v.no));
  (d.ventes || []).forEach(v => { if (!nos.has(v.no)) { ETAT.ventes.push(v); nos.add(v.no); } });
  const cl = new Set(ETAT.journal.map(clef));
  (d.journal || []).forEach(e => { const c = clef(e); if (!cl.has(c)) { ETAT.journal.push(e); cl.add(c); } });
  if (d.rupture && (d.rupture.ts || 0) > (ETAT.ruptureTs || 0)) { ETAT.rupture = d.rupture.map || {}; ETAT.ruptureTs = d.rupture.ts; }
  if (ETAT.tickets.length > 400) ETAT.tickets = ETAT.tickets.filter(k => !k.fait).slice(-400);
  if (JSON.stringify(Object.assign({}, ETAT, { v: 0 })) !== avant) { ETAT.v++; ecrisEtat(); }
  return { v: ETAT.v, gen: ETAT.gen };
}

/* ───────── pages : version à jour de GitHub, sinon copie ───────── */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.png': 'image/png', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
function telecharge(url) {
  return new Promise((ok, ko) => {
    const r = https.get(url, { timeout: 4000, headers: { 'Cache-Control': 'no-cache' } }, res => {
      if (res.statusCode !== 200) { res.resume(); return ko(new Error('HTTP ' + res.statusCode)); }
      const b = []; res.on('data', c => b.push(c)); res.on('end', () => ok(Buffer.concat(b)));
    });
    r.on('timeout', () => r.destroy(new Error('délai'))); r.on('error', ko);
  });
}
const DERNIER_TELECH = {};
async function fichier(nom) {
  nom = nom.replace(/[^A-Za-z0-9._-]/g, '') || 'caisse.html';
  const enCache = path.join(CACHE, nom);
  if (!DERNIER_TELECH[nom] || Date.now() - DERNIER_TELECH[nom] > 60000) {
    try {
      const d = await telecharge(SITE + nom + '?t=' + Math.floor(Date.now() / 60000));
      fs.writeFileSync(enCache, d); DERNIER_TELECH[nom] = Date.now();
    } catch (e) { DERNIER_TELECH[nom] = Date.now() - 45000; }
  }
  for (const f of [enCache, path.join(ICI, nom)]) { try { return fs.readFileSync(f); } catch (e) {} }
  return null;
}

/* ───────── page d'état ───────── */
function ipWifi() {
  const r = [];
  for (const l of Object.values(os.networkInterfaces())) for (const a of l || []) if (a.family === 'IPv4' && !a.internal) r.push(a.address);
  return r.sort((a, b) => (b.startsWith('192.168.') ? 1 : 0) - (a.startsWith('192.168.') ? 1 : 0));
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function pageEtat() {
  const lignes = ['cuisine', 'bar', 'caisse'].map(d => {
    const p = CFG.imprimantes[d] || {}, r = resoud(d);
    const ou = p.alias ? 'comme « ' + p.alias + ' » (' + (r ? r.ip : '?') + ')' : (p.ip || 'non réglée');
    return '<tr><td><b>' + d + '</b></td><td>' + esc(ou) + '</td><td><button onclick="test(\'' + d + '\')">Ticket de test</button> '
      + '<button onclick="calibre(\'' + d + '\')">Calibrage accents</button></td></tr>';
  }).join('');
  const ip = ipWifi()[0] || 'ADRESSE-DU-PC';
  return '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Phoenix Relais</title><style>body{font-family:Arial,system-ui;margin:2rem auto;max-width:44rem;padding:0 1rem;color:#16364A}'
    + 'h1{font-size:1.4rem;color:#8a6d2f}table{border-collapse:collapse;width:100%}td{padding:.5rem;border-bottom:1px solid #ddd}'
    + 'button{padding:.5rem .8rem;cursor:pointer;margin:2px}pre{background:#f5f5f2;padding:1rem;overflow:auto;font-size:.8rem;max-height:20rem}'
    + '.m{background:#f6f0e4;padding:.8rem 1rem;border-radius:10px;font-size:1.1rem}</style>'
    + '<h1>Phoenix Relais ' + VERSION + ' — impression automatique</h1>'
    + '<p class="m">Sur les tablettes et téléphones (wifi du bar) :<br><b>http://' + esc(ip) + ':' + CFG.port + '/caisse.html</b></p>'
    + '<p>La caisse sur ce PC : <a href="/caisse.html">/caisse.html</a> · l\'équipe : <a href="/equipe.html">/equipe.html</a> · le QG : <a href="/qg.html">/qg.html</a></p>'
    + '<table>' + lignes + '</table>'
    + '<p style="color:#777">Page de code ' + CFG.codepage + ' (' + ENC + ') · ' + (CFG.coupe !== false ? 'coupe auto' : 'sans coupe') + ' · tables partagées : version ' + ETAT.v + '</p>'
    + '<h2 style="font-size:1rem">Dernières impressions</h2><pre>' + esc(DERNIERES.join('\n') || '(rien encore)') + '</pre>'
    + '<script>function test(d){fetch("/imprime",{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},'
    + 'body:JSON.stringify({dest:d,texte:"\\u0001  TEST "+d.toUpperCase()+"\\nBrasserie Phoenix\\nAccents : é è à ç ñ - 12,50 €\\n"+new Date().toLocaleString("fr-FR")})})'
    + '.then(r=>r.json()).then(j=>{alert(j.ok?"Ticket de test envoyé à "+d:"Échec : "+j.erreur);location.reload()}).catch(e=>alert("Échec : "+e));}'
    + 'function calibre(d){fetch("/calibre?dest="+d,{method:"POST"}).then(r=>r.json()).then(j=>alert(j.ok?"Ticket de calibrage envoyé à "+d:"Échec : "+j.erreur)).catch(e=>alert("Échec : "+e));}</script>';
}

/* ───────── serveur ───────── */
function envoie(res, code, type, corps) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(corps);
}
const json = (res, o, code) => envoie(res, code || 200, 'application/json', JSON.stringify(o));
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }
  const b = []; req.on('data', c => b.push(c));
  req.on('end', async () => {
    const corps = Buffer.concat(b).toString('utf8');
    try {
      if (p === '/sync/version') return json(res, { v: ETAT.v, gen: ETAT.gen });
      if (p === '/sync/etat') return json(res, ETAT);
      if (p === '/sync/maj' && req.method === 'POST') return json(res, appliqueMaj(JSON.parse(corps || '{}')));
      if (p === '/imprime' && req.method === 'POST') {
        const d = JSON.parse(corps || '{}');
        try { await imprime(d.dest || 'caisse', d.texte || ''); return json(res, { ok: true }); }
        catch (e) { log('ÉCHEC impression', d.dest, ':', e.message); return json(res, { ok: false, erreur: e.message }, 502); }
      }
      if (p === '/calibre' && req.method === 'POST') {
        const imp = resoud(u.searchParams.get('dest') || 'cuisine');
        if (!imp) return json(res, { ok: false, erreur: 'destination inconnue' }, 400);
        try { await envoieTCP(imp.ip, imp.port, ticketCalibrage()); log('calibrage ->', imp.nom); return json(res, { ok: true }); }
        catch (e) { return json(res, { ok: false, erreur: e.message }, 502); }
      }
      if (p === '/sante') return json(res, { ok: true, version: VERSION, v: ETAT.v, qr: true });
      if (p === '/' || p === '/etat') return envoie(res, 200, 'text/html; charset=utf-8', pageEtat());
      const d = await fichier(p.slice(1));
      if (!d) return json(res, { erreur: 'introuvable' }, 404);
      envoie(res, 200, TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', d);
    } catch (e) { log('erreur', p, e.message); json(res, { erreur: e.message }, 400); }
  });
});
srv.on('error', e => {
  if (e.code === 'EADDRINUSE') log('Le port ' + CFG.port + ' est déjà pris : un Phoenix Relais tourne déjà (fermer l\'ancienne fenêtre noire).');
  else log('Erreur serveur :', e.message);
  setTimeout(() => process.exit(1), 15000);
});
srv.listen(CFG.port, '0.0.0.0', () => {
  process.title = 'Phoenix Relais ' + VERSION;
  log('══════ PHOENIX RELAIS ' + VERSION + ' ══════');
  log('Page d\'état sur ce PC : http://localhost:' + CFG.port + '/');
  ipWifi().forEach(ip => log('Sur le wifi : http://' + ip + ':' + CFG.port + '/caisse.html'));
  log('Laisser cette fenêtre ouverte pendant le service.');
  ['cuisine', 'bar'].forEach(d => { const r = resoud(d); if (r) envoieTCP(r.ip, r.port, Buffer.alloc(0)).then(() => log(d, 'joignable (' + r.ip + ')')).catch(e => log('ATTENTION', d, 'injoignable :', e.message)); });
});
