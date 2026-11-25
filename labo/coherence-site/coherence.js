/* Labo 24/11/2026 — Cohérence site public ↔ caisse
 * Compare ce que Google et les assistants IA lisent sur le site (JSON-LD Restaurant + Menu
 * des pages fr/es/en/nl) avec la carte de la caisse (même règle que la caisse : carte intégrée D
 * + modifications de l'onglet « Carte caisse », produits supprimés et cachés exclus).
 * Ne modifie rien : lit, compare, écrit un rapport.
 * equivalences.json : noms volontairement différents (site → caisse), pour ne pas alerter à tort.
 * Usage : node coherence.js <caisse.html> <dossier docs du site> [carte-caisse.json] [--html rapport.html] [--json r.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LANGUES = ['fr', 'es', 'en', 'nl'];
const JOURS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/* rubriques du site (FR) → rayons de la caisse */
const RUBRIQUES = [
  [/entr/i, ['Entrées froides', 'Entrées chaudes']],
  [/salade/i, ['Salades']],
  [/viande|pierre/i, ['Viandes sur Pierre']],
  [/p[aâ]tes/i, ['Pâtes Maison']],
  [/enfant/i, ['Enfants']],
  [/dessert/i, ['Desserts']],
  [/menu/i, ['Menus']],
  [/plat/i, ['Plats']],
];
const MOTS_VIDES = new Set(['les', 'des', 'sauce', 'avec', 'aux', 'facon', 'sur', 'une', 'son', 'sa', 'ses', 'servi', 'temps', 'du', 'de', 'la', 'le', 'et', 'au', 'en', 'ou']);

function sansAccent(s) {
  return String(s || '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function mots(s) {
  return sansAccent(s).replace(/[^a-z0-9]+/g, ' ').split(' ')
    .filter(w => w.length > 1 && !MOTS_VIDES.has(w))
    .map(w => w.replace(/s$/, ''));
}
function dice(a, b) {
  const A = new Set(mots(a)), B = new Set(mots(b));
  if (!A.size || !B.size) return 0;
  let n = 0; A.forEach(x => { if (B.has(x)) n++; });
  return 2 * n / (A.size + B.size);
}
/* « 12,10 € », « €21.20 », « 21.2 », 21.2 → 21.2 ; vide → null ; illisible → NaN (jamais compté juste) */
function prixNombre(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  let t = String(v).replace(/[\s\u00a0\u202f]/g, '').replace(/eur(os?)?|€/gi, '');
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '');
  t = t.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
  return Math.round(Number(t) * 100) / 100;
}
/* tous les prix annoncés d'un plat : offres multiples, AggregateOffer (lowPrice/highPrice) */
function prixOffres(item) {
  const out = [];
  [].concat(item.offers || []).forEach(o => {
    if (!o || typeof o !== 'object') return;
    ['price', 'lowPrice', 'highPrice'].forEach(k => { const n = prixNombre(o[k]); if (n !== null) out.push(n); });
  });
  return out;
}

/* ── carte de la caisse ─────────────────────────────────────────── */
function lireCarteCaisse(html, modifs) {
  const ligne = html.split('\n').find(l => l.startsWith('var D = '));
  if (!ligne) throw new Error('carte intégrée (var D) introuvable dans caisse.html');
  const D = JSON.parse(ligne.slice(8).replace(/;\s*$/, ''));
  const par = {}, ordre = [];
  D.produits.forEach(p => { par[p.id] = p; ordre.push(p.id); });
  (modifs || []).forEach(o => {
    if (!o || !o.id) return;
    if (!par[o.id]) ordre.push(o.id);
    par[o.id] = o.suppr ? { id: o.id, suppr: 1 } : o;
  });
  return ordre.map(id => par[id]).filter(p => p && !p.suppr && !p.cache);
}
/* onglet « Carte caisse » exporté : [[Id, Json, MajLe, MajPar], …] ou tableau d'objets produit */
function lireModifs(brut) {
  const v = JSON.parse(brut);
  if (!Array.isArray(v)) return [];
  return v.map(r => {
    if (Array.isArray(r)) { if (r[0] === 'Id') return null; try { return JSON.parse(r[1]); } catch (e) { return null; } }
    return r;
  }).filter(Boolean);
}

/* ── JSON-LD d'une page du site ─────────────────────────────────── */
function lireJsonLd(html) {
  const blocs = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m, erreurs = 0;
  while ((m = re.exec(html))) {
    try { const j = JSON.parse(m[1]); (Array.isArray(j) ? j : (j['@graph'] || [j])).forEach(x => blocs.push(x)); }
    catch (e) { erreurs++; }
  }
  const resto = blocs.find(b => [].concat(b['@type']).some(t => /Restaurant|FoodEstablishment/.test(t)));
  return { resto, erreurs, nbBlocs: blocs.length };
}
function platSite(i, rubrique, is, ii) {
  const tous = prixOffres(i), uniques = [...new Set(tous)];
  return { rubrique, is, ii, nom: i.name || '', prix: uniques.length === 1 ? uniques[0] : (uniques.length ? NaN : null), prixTous: uniques };
}
function platsDuMenu(resto) {
  const out = [];
  const menus = [].concat((resto && resto.hasMenu) || []);
  menus.forEach(menu => {
    [].concat(menu.hasMenuSection || []).forEach((s, is) => {
      [].concat(s.hasMenuItem || []).forEach((i, ii) => {
        out.push(platSite(i, s.name || '', is, ii));
      });
    });
    [].concat(menu.hasMenuItem || []).forEach((i, ii) => {
      out.push(platSite(i, '', -1, ii));
    });
  });
  return out;
}
function horaires(resto) {
  const ouvert = new Set(), creneaux = [];
  [].concat((resto && resto.openingHoursSpecification) || []).forEach(o => {
    [].concat(o.dayOfWeek || []).forEach(d => {
      const j = String(d).replace(/^https?:\/\/schema\.org\//, '');
      ouvert.add(j); creneaux.push(j + ' ' + o.opens + '-' + o.closes);
    });
  });
  return { ouvert, creneaux: creneaux.sort() };
}

/* ── rapprochement d'un plat du site avec la caisse ─────────────── */
function rayonsPour(rubrique) {
  for (const [re, cats] of RUBRIQUES) if (re.test(rubrique)) return cats;
  return null;
}
function rapproche(plat, carte, equivalences) {
  const eq = equivalences && equivalences[plat.nom];
  if (eq) { const p = carte.find(x => x.nom === eq); if (p) return { sur: true, p, score: 1, equivalence: true }; }
  /* nom exact : cherché dans TOUTE la carte (un plat peut être rangé ailleurs, Hors carte, Lunch…) */
  const cle = x => sansAccent(x).replace(/[^a-z0-9]/g, '');
  const exacts = carte.filter(p => cle(p.nom) === cle(plat.nom));
  if (exacts.length === 1 && !/\s(ou|o|or|of)\s/i.test(plat.nom)) return { sur: true, p: exacts[0], score: 1 };
  const cats = rayonsPour(plat.rubrique);
  const cands = carte.filter(p => !cats || cats.includes(p.cat))
    .map(p => ({ p, s: dice(plat.nom, p.nom) }))
    .sort((a, b) => b.s - a.s);
  const exact = cands.find(c => sansAccent(c.p.nom).replace(/[^a-z0-9]/g, '') === sansAccent(plat.nom).replace(/[^a-z0-9]/g, ''));
  /* « Espadon ou Thon grillé » = deux produits en caisse : jamais choisir l'un des deux en silence */
  const double = /\s(ou|o|or|of)\s/i.test(plat.nom);
  if (exact && !double) return { sur: true, p: exact.p, score: 1 };
  const [a, b] = cands;
  if (!a || a.s < 0.5) return { sur: false, p: null, score: a ? a.s : 0 };
  /* sûr seulement si net (≥ 0,75) et sans concurrent proche */
  const sur = !double && a.s >= 0.75 && (!b || a.s - b.s >= 0.2);
  let autre = b && b.s >= 0.5 ? b.p : null;
  if (double && !autre) { /* 2e plat nommé après « ou » */
    const apres = plat.nom.split(/\s(?:ou|o|or|of)\s/i)[1] || '';
    const c2 = cands.filter(c => c.p !== a.p).map(c => ({ p: c.p, s: dice(apres, c.p.nom) })).sort((x, y) => y.s - x.s)[0];
    if (c2 && c2.s >= 0.5) autre = c2.p;
  }
  return { sur, p: a.p, score: a.s, autre, raison: double ? 'deux plats dans un seul nom' : '' };
}

/* ── contrôle complet ───────────────────────────────────────────── */
const REGLAGES_DEFAUT = { joursFermes: [], telephoneFin: '', motsInterdits: [] };
const JOURS_FR = { Monday: 'lundi', Tuesday: 'mardi', Wednesday: 'mercredi', Thursday: 'jeudi', Friday: 'vendredi', Saturday: 'samedi', Sunday: 'dimanche' };
function controle(caisseHtml, pages, modifs, equivalences, reglages) {
  const RG = Object.assign({}, REGLAGES_DEFAUT, reglages || {});
  const carte = lireCarteCaisse(caisseHtml, modifs);
  const r = { date: new Date().toISOString(), ecarts: [], aVerifier: [], absents: [], langues: [], regles: [], alertes: [], ok: 0, nbPlats: 0,
    source: modifs == null ? 'carte intégrée de caisse.html seule (onglet « Carte caisse » non chargé)'
      : 'carte intégrée de caisse.html + ' + modifs.length + ' modification(s) de l’onglet « Carte caisse »' };
  if (modifs == null) r.alertes.push('Onglet « Carte caisse » non chargé : si des prix y ont été changés, ce rapport ne les voit pas.');
  const lu = {};
  LANGUES.forEach(l => {
    if (pages[l] == null) { r.langues.push({ langue: l, probleme: 'page introuvable' }); return; }
    const j = lireJsonLd(pages[l]);
    if (j.erreurs) r.langues.push({ langue: l, probleme: j.erreurs + ' bloc(s) JSON-LD illisible(s) : Google les ignore' });
    if (!j.resto) { r.langues.push({ langue: l, probleme: 'aucune fiche Restaurant dans le JSON-LD' }); return; }
    lu[l] = { resto: j.resto, plats: platsDuMenu(j.resto), h: horaires(j.resto) };
    /* règles de marque et faits fixes, sur le texte visible + JSON-LD */
    const txt = pages[l];
    const txtSa = sansAccent(txt); /* « semigastronómico » = « semigastronomico » */
    RG.motsInterdits.forEach(([motif, message]) => { if (new RegExp(sansAccent(motif), 'i').test(txtSa)) r.regles.push({ langue: l, probleme: message }); });
    if (RG.joursFermes.length && !lu[l].h.creneaux.length) r.regles.push({ langue: l, probleme: 'horaires non lus (absents ou dans un format non détaillé) : jour de fermeture non vérifiable' });
    RG.joursFermes.forEach(jr => { if (lu[l].h.ouvert.has(jr)) r.regles.push({ langue: l, probleme: 'jour de fermeture (' + (JOURS_FR[jr] || jr) + ') indiqué ouvert dans les horaires lus par Google' }); });
    const tel = String(j.resto.telephone || '').replace(/\D/g, '');
    if (RG.telephoneFin && !tel) r.regles.push({ langue: l, probleme: 'aucun téléphone dans les données lues par Google' });
    else if (RG.telephoneFin && !tel.endsWith(RG.telephoneFin)) r.regles.push({ langue: l, probleme: 'téléphone inattendu : ' + j.resto.telephone });
  });
  const ref = lu.fr;
  if (ref) {
    ref.plats.forEach(pl => {
      r.nbPlats++;
      const m = rapproche(pl, carte, equivalences);
      if (!m.p) { r.absents.push({ site: pl.nom, rubrique: pl.rubrique, prixSite: pl.prix }); return; }
      const pc = prixNombre(m.p.prix);
      const ligne = { site: pl.nom, rubrique: pl.rubrique, prixSite: pl.prix, caisse: m.p.nom, prixCaisse: pc };
      const aVerif = raison => r.aVerifier.push(Object.assign(ligne, { raison, autre: m.autre ? m.autre.nom + ' (' + fmt(prixNombre(m.autre.prix)) + ')' : '' }));
      if (!m.sur) return aVerif(m.raison || 'nom proche, pas identique');
      if (Number.isNaN(pl.prix)) return aVerif(pl.prixTous.length > 1 ? 'plusieurs prix sur le site : ' + pl.prixTous.map(fmt).join(' / ') : 'prix du site illisible');
      if (pl.prix == null && !pc) { r.ok++; return; } /* prix du jour des deux côtés */
      if (pl.prix == null) return aVerif('pas de prix sur le site (prix du jour ?), ' + fmt(pc) + ' en caisse');
      if (!pc) return aVerif('prix fixe sur le site, prix libre (0 €) en caisse');
      if (Math.abs(pl.prix - pc) >= 0.01) r.ecarts.push(Object.assign(ligne, { diff: Math.round((pl.prix - pc) * 100) / 100 }));
      else r.ok++;
    });
    /* les 3 autres langues doivent dire la même chose que le FR (même place, même prix, mêmes horaires) */
    ['es', 'en', 'nl'].forEach(l => {
      const o = lu[l]; if (!o) return;
      if (o.plats.length !== ref.plats.length)
        r.langues.push({ langue: l, probleme: o.plats.length + ' plats au lieu de ' + ref.plats.length + ' en FR' });
      const n = Math.min(o.plats.length, ref.plats.length);
      for (let k = 0; k < n; k++) {
        const a = ref.plats[k], b = o.plats[k];
        if (String(a.prix) !== String(b.prix))
          r.langues.push({ langue: l, probleme: '« ' + b.nom + ' » à ' + fmt(b.prix) + ' alors que le FR « ' + a.nom + ' » est à ' + fmt(a.prix) });
      }
      if (o.h.creneaux.join('|') !== ref.h.creneaux.join('|'))
        r.langues.push({ langue: l, probleme: 'horaires différents du FR' });
    });
  }
  if (!r.nbPlats) r.alertes.push('Aucun plat lu sur la page FR : contrôle impossible (page absente, ou carte non décrite dans les données structurées).');
  return r;
}
function fmt(n) { return n == null || Number.isNaN(n) ? '—' : n.toFixed(2).replace('.', ',') + ' €'; }

/* ── rapport lisible sur téléphone ──────────────────────────────── */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function rapportHtml(r) {
  const n = r.ecarts.length + r.aVerifier.length + r.absents.length + r.langues.length + r.regles.length;
  const quand = new Date(r.date).toLocaleString('fr-FR', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' });
  const bloc = (titre, aide, lignes) => !lignes.length ? '' :
    '<section><h2>' + esc(titre) + ' <span class="n">' + lignes.length + '</span></h2><p class="aide">' + esc(aide) + '</p>' + lignes.join('') + '</section>';
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Site ↔ caisse</title><style>' +
    ':root{--navy:#16364A;--copper:#B98D55;--cream:#F6F0E4;--rouge:#a23b2a}' +
    '*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--navy);font:16px/1.45 Jost,Arial,sans-serif;padding:16px;max-width:640px;margin:auto}' +
    'h1{font:600 26px "Cormorant Garamond",Georgia,serif;margin:0 0 4px}h2{font-size:17px;margin:22px 0 4px}.n{background:var(--copper);color:#fff;border-radius:12px;padding:0 9px;font-size:14px}' +
    '.aide{margin:0 0 8px;font-size:14px;opacity:.8}.carte{background:#fff;border-radius:10px;padding:10px 12px;margin:0 0 8px;box-shadow:0 1px 3px #0002}' +
    '.carte b{display:block}.px{display:flex;gap:10px;flex-wrap:wrap;font-size:15px;margin-top:4px}.px span{white-space:nowrap}.px span.lg{white-space:normal}.carte{overflow-wrap:anywhere}.bad{color:var(--rouge);font-weight:600}.nom{font-size:14px;opacity:.8}' +
    '.alerte{background:#fbe6df;border-radius:10px;padding:12px;font-weight:600;color:var(--rouge)}.vert{background:#e3efe3;border-radius:10px;padding:14px;font-weight:600}' +
    '</style></head><body><h1>Site ↔ caisse</h1><p class="aide">Ce que Google et les assistants IA lisent sur le site public (pages FR/ES/EN/NL), comparé à la caisse. ' +
    esc(r.nbPlats) + ' plats lus, ' + esc(r.ok) + ' identiques.</p><p class="aide">Contrôle du ' + esc(quand) + ' · ' + esc(r.source) + '</p>' +
    r.alertes.map(a => '<p class="alerte">' + esc(a) + '</p>').join('') +
    (n === 0 && r.nbPlats > 0 ? '<p class="vert">Tout concorde : rien à faire.</p>' : '') +
    bloc('Prix différents', 'Le client voit un prix en ligne et paie un autre prix. Choisir le bon et corriger l’autre.',
      r.ecarts.map(e => '<div class="carte"><b>' + esc(e.site) + '</b><div class="px"><span>Site : ' + fmt(e.prixSite) + '</span><span>Caisse : ' + fmt(e.prixCaisse) + '</span></div><div class="px"><span class="bad lg">' + (e.diff > 0 ? 'Site plus cher de ' : 'Site moins cher de ') + fmt(Math.abs(e.diff)) + '</span></div>' +
        (sansAccent(e.caisse) !== sansAccent(e.site) ? '<div class="px"><span class="lg nom">En caisse : « ' + esc(e.caisse) + ' »</span></div>' : '') + '</div>')) +
    bloc('Plats du site introuvables en caisse', 'Plat retiré de la carte ? Le retirer du site. Sinon, il manque en caisse.',
      r.absents.map(e => '<div class="carte"><b>' + esc(e.site) + '</b><div class="px"><span>' + esc(e.rubrique) + '</span><span>Site : ' + fmt(e.prixSite) + '</span></div></div>')) +
    bloc('À vérifier', 'Comparaison pas sûre (nom proche, deux plats en un, prix libre…) : regarder et trancher.',
      r.aVerifier.map(e => '<div class="carte"><b>' + esc(e.site) + '</b><div class="px"><span>Site : ' + fmt(e.prixSite) + '</span><span class="lg">Caisse « ' + esc(e.caisse) + ' » : ' + fmt(e.prixCaisse) + '</span>' +
        (e.autre ? '<span class="lg">ou « ' + esc(e.autre) + ' »</span>' : '') + '</div><div class="px"><span class="lg nom">' + esc(e.raison) + '</span></div></div>')) +
    bloc('Langues', 'Les pages ES / EN / NL doivent dire la même chose que la page FR.',
      r.langues.map(e => '<div class="carte"><b>' + esc(e.langue.toUpperCase()) + '</b>' + esc(e.probleme) + '</div>')) +
    bloc('Règles', 'Horaires, téléphone, mots de la marque.',
      r.regles.map(e => '<div class="carte"><b>' + esc(e.langue.toUpperCase()) + '</b>' + esc(e.probleme) + '</div>')) +
    '</body></html>';
}

module.exports = { prixNombre, controle, rapportHtml, lireCarteCaisse, lireModifs, lireJsonLd, rapproche, dice, mots, LANGUES };

if (require.main === module) {
  const a = process.argv.slice(2);
  const opt = k => { const i = a.indexOf(k); if (i < 0) return null; const v = a[i + 1]; a.splice(i, 2); return v; };
  const sortieHtml = opt('--html'), sortieJson = opt('--json');
  const [caisse, docs, modifsFichier] = a;
  if (!caisse || !docs) { console.error('usage : node coherence.js caisse.html docs/ [carte-caisse.json] [--html f] [--json f]'); process.exit(2); }
  const pages = {};
  LANGUES.forEach(l => { const f = path.join(docs, l, 'index.html'); pages[l] = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; });
  const modifs = modifsFichier ? lireModifs(fs.readFileSync(modifsFichier, 'utf8')) : null;
  const fEq = path.join(__dirname, 'equivalences.json');
  const eq = fs.existsSync(fEq) ? JSON.parse(fs.readFileSync(fEq, 'utf8')).noms || {} : {};
  const fRg = path.join(__dirname, 'reglages.json');
  const rg = fs.existsSync(fRg) ? JSON.parse(fs.readFileSync(fRg, 'utf8')) : {};
  const r = controle(fs.readFileSync(caisse, 'utf8'), pages, modifs, eq, rg);
  if (sortieHtml) fs.writeFileSync(sortieHtml, rapportHtml(r));
  if (sortieJson) fs.writeFileSync(sortieJson, JSON.stringify(r, null, 1));
  console.log(`${r.nbPlats} plats · ${r.ok} identiques · ${r.ecarts.length} prix différents · ${r.absents.length} introuvables · ${r.aVerifier.length} à vérifier · ${r.langues.length} langues · ${r.regles.length} règles`);
  r.ecarts.forEach(e => console.log('  PRIX', e.site, fmt(e.prixSite), '≠ caisse', e.caisse, fmt(e.prixCaisse)));
  r.absents.forEach(e => console.log('  ABSENT', e.site, fmt(e.prixSite)));
  r.aVerifier.forEach(e => console.log('  ?', e.site, fmt(e.prixSite), '~', e.caisse, fmt(e.prixCaisse)));
  r.langues.forEach(e => console.log('  LANGUE', e.langue, e.probleme));
  r.regles.forEach(e => console.log('  REGLE', e.langue, e.probleme));
  r.alertes.forEach(a => console.log('  ALERTE', a));
}
