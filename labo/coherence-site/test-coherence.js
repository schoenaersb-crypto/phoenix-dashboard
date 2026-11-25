/* Tests du prototype « Cohérence site ↔ caisse » : node labo/coherence-site/test-coherence.js [docs du site] */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const C0 = require('./coherence.js');
const RG = JSON.parse(fs.readFileSync(path.join(__dirname, 'reglages.json'), 'utf8'));
const C = Object.assign({}, C0, { controle: (c, p, m, e) => C0.controle(c, p, m === undefined ? [] : m, e, RG) });
let ok = 0, ko = 0;
function t(nom, f) { try { f(); ok++; console.log('  ok  ' + nom); } catch (e) { ko++; console.log('  KO  ' + nom + ' — ' + e.message); } }

const caisseVraie = fs.readFileSync(path.join(__dirname, '../../caisse.html'), 'utf8');
/* mini caisse factice */
function caisse(produits) { return 'x\nvar D = ' + JSON.stringify({ produits, ordre: [] }) + ';\ny'; }
function page(resto, extra) {
  return '<html><head><script type="application/ld+json">' + JSON.stringify(Object.assign({ '@context': 'https://schema.org', '@type': 'Restaurant', name: 'Brasserie Phoenix', telephone: '+34 744 62 29 75',
    openingHoursSpecification: [{ dayOfWeek: ['Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday'], opens: '12:00', closes: '15:00' }] }, resto)) + '</script></head><body>' + (extra || '') + '</body></html>';
}
function menu(items) { return { hasMenu: { '@type': 'Menu', hasMenuSection: [{ name: 'Nos Plats', hasMenuItem: items.map(([n, p]) => ({ '@type': 'MenuItem', name: n, offers: p == null ? undefined : { price: p } })) }] } }; }
const P = [{ id: 'a', nom: 'Burger italien', cat: 'Plats', prix: 18.9 }, { id: 'b', nom: 'Seiche à la plancha, légumes & frites', cat: 'Plats', prix: 18.9 },
  { id: 'c', nom: 'Suprême de volaille à la truffe', cat: 'Plats', prix: 22.9 }];
const quatre = p => ({ fr: p, es: p, en: p, nl: p });

console.log('Cohérence site ↔ caisse');
t('tout concorde → aucun écart', () => {
  const r = C.controle(caisse(P), quatre(page(menu([['Burger italien', '18.90'], ['Seiche à la plancha, légumes & frites', '18.90']])))) ;
  assert.strictEqual(r.ecarts.length + r.absents.length + r.aVerifier.length + r.langues.length + r.regles.length, 0); assert.strictEqual(r.ok, 2);
});
t('prix différent détecté avec le bon écart', () => {
  const r = C.controle(caisse(P), quatre(page(menu([['Burger italien', '21.20']]))));
  assert.strictEqual(r.ecarts.length, 1); assert.strictEqual(r.ecarts[0].diff, 2.3);
});
t('prix « 21,20 » avec virgule lu comme 21.20', () => {
  const r = C.controle(caisse(P), quatre(page(menu([['Burger italien', '21,20']])))); assert.strictEqual(r.ecarts[0].prixSite, 21.2);
});
t('accents, œ, & et casse ignorés (« Supreme de VOLAILLE a la truffe »)', () => {
  const r = C.controle(caisse(P), quatre(page(menu([['Supreme de VOLAILLE a la truffe', '22.90']])))); assert.strictEqual(r.ok, 1);
});
t('« bœuf » (site) = « boeuf » (caisse)', () => {
  const r = C.controle(caisse([{ id: 't', nom: 'Tartare de boeuf préparé minute', cat: 'Plats', prix: 22.9 }]), quatre(page(menu([['Tartare de bœuf préparé minute', '22.90']]))));
  assert.strictEqual(r.ok, 1);
});
t('prix du jour des deux côtés (aucun prix site, 0 € caisse) → pas d\'alerte', () => {
  const r = C.controle(caisse([{ id: 'b', nom: 'Bœuf Black Angus', cat: 'Plats', prix: 0 }]), quatre(page(menu([['Bœuf Black Angus', null]])))); assert.strictEqual(r.ok, 1);
});
t('aucun prix sur le site mais prix fixe en caisse → à vérifier', () => {
  const r = C.controle(caisse(P), quatre(page(menu([['Burger italien', null]])))); assert.strictEqual(r.aVerifier.length, 1); assert.strictEqual(r.ok, 0);
});
t('plat du site absent de la caisse → « introuvable »', () => {
  const r = C.controle(caisse(P), quatre(page(menu([['Ramen du jour', '20']])))); assert.strictEqual(r.absents.length, 1);
});
t('produit supprimé dans l\'onglet Carte caisse → introuvable', () => {
  const modifs = C.lireModifs(JSON.stringify([['Id', 'Json', 'MajLe', 'MajPar'], ['a', JSON.stringify({ id: 'a', suppr: 1 }), '', '']]));
  const r = C.controle(caisse(P), quatre(page(menu([['Burger italien', '18.90']]))), modifs); assert.strictEqual(r.absents.length, 1);
});
t('prix changé dans l\'onglet Carte caisse → c\'est lui qui compte', () => {
  const modifs = C.lireModifs(JSON.stringify([['a', JSON.stringify({ id: 'a', nom: 'Burger italien', cat: 'Plats', prix: 21.2 })]]));
  const r = C.controle(caisse(P), quatre(page(menu([['Burger italien', '21.20']]))), modifs); assert.strictEqual(r.ok, 1);
});
t('produit caché en caisse → introuvable', () => {
  const r = C.controle(caisse([Object.assign({}, P[0], { cache: 1 })]), quatre(page(menu([['Burger italien', '18.90']])))); assert.strictEqual(r.absents.length, 1);
});
t('nom proche mais pas sûr → « à vérifier », jamais compté juste', () => {
  const r = C.controle(caisse([{ id: 'x', nom: 'Tarte aux pommes', cat: 'Plats', prix: 12.9 }]), quatre(page(menu([['Tartelette aux pommes maison', '12.90']]))));
  assert.strictEqual(r.ok, 0); assert.strictEqual(r.ecarts.length + r.aVerifier.length + r.absents.length, 1);
});
t('deux candidats proches → « à vérifier » (pas de choix au hasard)', () => {
  const r = C.controle(caisse([{ id: 'x', nom: 'Carpaccio de gambas rouge', cat: 'Plats', prix: 21.9 }, { id: 'y', nom: 'Carpaccio de gambas blanc', cat: 'Plats', prix: 19.9 }]),
    quatre(page(menu([['Carpaccio de gambas', '18.90']]))));
  assert.strictEqual(r.aVerifier.length, 1);
});
t('équivalence confirmée (Brochette de scampis = Potence Gambas)', () => {
  const r = C.controle(caisse([{ id: 'p', nom: 'Potence Gambas flambée au Ricard', cat: 'Viandes sur Pierre', prix: 33.9 }]),
    quatre(page({ hasMenu: { hasMenuSection: [{ name: 'Nos Viandes sur Pierre', hasMenuItem: [{ name: 'Brochette de scampis', offers: { price: '33.90' } }] }] } })),
    [], { 'Brochette de scampis': 'Potence Gambas flambée au Ricard' });
  assert.strictEqual(r.ok, 1);
});
t('mercredi ouvert dans les horaires → règle', () => {
  const r = C.controle(caisse(P), quatre(page(Object.assign(menu([]), { openingHoursSpecification: [{ dayOfWeek: ['Wednesday'], opens: '12:00', closes: '15:00' }] }))));
  assert.ok(r.regles.some(x => /mercredi/.test(x.probleme)));
});
t('« semi-gastronomique » et « 3CM1 » repérés', () => {
  const r = C.controle(caisse(P), quatre(page(menu([]), 'Cuisine semi-gastronomique, sauce 3CM1')));
  assert.strictEqual(r.regles.length, 8);
});
t('mauvais téléphone repéré', () => {
  const r = C.controle(caisse(P), quatre(page(Object.assign(menu([]), { telephone: '+34 600 00 00 00' })))); assert.strictEqual(r.regles.length, 4);
});
t('prix NL différent du FR → langue', () => {
  const fr = page(menu([['Burger italien', '18.90']])), nl = page(menu([['Italiaanse burger', '19.90']]));
  const r = C.controle(caisse(P), { fr, es: fr, en: fr, nl }); assert.strictEqual(r.langues.length, 1); assert.strictEqual(r.langues[0].langue, 'nl');
});
t('page ES manquante → signalée, le reste continue', () => {
  const fr = page(menu([['Burger italien', '18.90']]));
  const r = C.controle(caisse(P), { fr, es: null, en: fr, nl: fr }); assert.ok(r.langues.some(x => x.langue === 'es')); assert.strictEqual(r.ok, 1);
});
t('JSON-LD cassé → signalé (Google l\'ignore)', () => {
  const casse = '<script type="application/ld+json">{"@type":"Restaurant",</script>';
  const r = C.controle(caisse(P), { fr: casse, es: casse, en: casse, nl: casse }); assert.strictEqual(r.langues.length, 8);
});
t('prix « 12,10 € », « €21.20 », « 1.234,50 », nombre → lus ; « sur demande » → illisible', () => {
  assert.strictEqual(C.prixNombre('12,10 €'), 12.1); assert.strictEqual(C.prixNombre('€21.20'), 21.2);
  assert.strictEqual(C.prixNombre('1.234,50'), 1234.5); assert.strictEqual(C.prixNombre(18.9), 18.9);
  assert.ok(Number.isNaN(C.prixNombre('sur demande'))); assert.strictEqual(C.prixNombre(''), null);
});
t('prix « 21,20 € » avec symbole → écart détecté (pas compté juste)', () => {
  const r = C.controle(caisse(P), quatre(page(menu([['Burger italien', '21,20 €']])))); assert.strictEqual(r.ecarts.length, 1);
});
t('prix illisible → à vérifier, jamais identique', () => {
  const r = C.controle(caisse(P), quatre(page(menu([['Burger italien', 'sur demande']])))); assert.strictEqual(r.ok, 0); assert.strictEqual(r.aVerifier.length, 1);
});
t('prix fixe sur le site mais 0 € (prix libre) en caisse → à vérifier', () => {
  const r = C.controle(caisse([{ id: 's', nom: 'Sélection de viande en suggestion', cat: 'Plats', prix: 0 }]), quatre(page(menu([['Sélection de viande en suggestion', '21.90']]))));
  assert.strictEqual(r.ok, 0); assert.strictEqual(r.aVerifier.length, 1);
});
t('plusieurs offres de prix différents ou AggregateOffer → à vérifier', () => {
  const pg = page({ hasMenu: { hasMenuSection: [{ name: 'Nos Plats', hasMenuItem: [
    { name: 'Burger italien', offers: [{ price: '18.90' }, { price: '21.20' }] },
    { name: 'Seiche à la plancha, légumes & frites', offers: { '@type': 'AggregateOffer', lowPrice: '18.90', highPrice: '22.90' } },
    { name: 'Suprême de volaille à la truffe', offers: [{ price: '22.90' }, { price: '22,90 €' }] }] }] } });
  const r = C.controle(caisse(P), quatre(pg)); assert.strictEqual(r.aVerifier.length, 2); assert.strictEqual(r.ok, 1);
});
t('« Espadon ou Thon grillé » → à vérifier avec les deux produits de caisse', () => {
  const r = C.controle(caisse([{ id: 'e', nom: 'Espadon grillé, chimichurri', cat: 'Plats', prix: 24.9 }, { id: 't', nom: 'Thon grillé, chimichurri', cat: 'Plats', prix: 28.9 }]),
    quatre(page(menu([['Espadon ou Thon grillé, chimichurri', '26.90']]))));
  assert.strictEqual(r.aVerifier.length, 1); assert.ok(/Thon|Espadon/.test(r.aVerifier[0].autre)); assert.strictEqual(r.ecarts.length, 0);
});
t('aucun plat lu → alerte, jamais « Tout concorde »', () => {
  const r = C.controle(caisse(P), quatre(page({ hasMenu: 'https://exemple/menu' }))); const h = C.rapportHtml(r);
  assert.ok(r.alertes.length); assert.ok(!/Tout concorde/.test(h)); assert.ok(/Aucun plat lu/.test(h));
});
t('onglet « Carte caisse » non chargé → averti dans le rapport ; chargé → source indiquée', () => {
  const r1 = C0.controle(caisse(P), quatre(page(menu([['Burger italien', '18.90']]))), undefined, {}, RG);
  assert.ok(/non chargé/.test(C.rapportHtml(r1)));
  const r2 = C.controle(caisse(P), quatre(page(menu([['Burger italien', '18.90']]))), []); assert.ok(/0 modification/.test(r2.source)); assert.strictEqual(r2.alertes.length, 0);
});
t('rapport : nom du produit de caisse et sens de l\'écart affichés', () => {
  const r = C.controle(caisse([{ id: 'c', nom: 'Camembert rôti au four & sa charcuterie', cat: 'Entrées froides', prix: 13.9 }]),
    quatre(page({ hasMenu: { hasMenuSection: [{ name: 'Nos Entrées', hasMenuItem: [{ name: 'Camembert rôti & charcuterie', offers: { price: '14.90' } }] }] } })));
  const h = C.rapportHtml(r); assert.ok(/Site plus cher de 1,00/.test(h)); assert.ok(/En caisse : « Camembert rôti au four/.test(h));
});
t('téléphone absent et mention TheFork → règles', () => {
  const pg = page(Object.assign(menu([]), { telephone: '' }), '<a href="https://www.thefork.es/x">');
  const r = C.controle(caisse(P), quatre(pg)); assert.strictEqual(r.regles.length, 8);
});
t('jours de fermeture lus dans reglages.json (pas en dur)', () => {
  const pg = page(Object.assign(menu([]), { openingHoursSpecification: [{ dayOfWeek: ['Wednesday'], opens: '12:00', closes: '15:00' }] }));
  assert.strictEqual(C0.controle(caisse(P), quatre(pg), [], {}, Object.assign({}, RG, { joursFermes: [] })).regles.length, 0);
});
t('nom exact rangé dans une autre rubrique (ou en Hors carte) → trouvé, pas « introuvable »', () => {
  const r = C.controle(caisse([{ id: 'h', nom: 'Burger italien', cat: 'Hors carte', prix: 18.9 }]),
    quatre(page({ hasMenu: { hasMenuSection: [{ name: 'Nos Viandes', hasMenuItem: [{ name: 'Burger italien', offers: { price: '18.90' } }] }] } })));
  assert.strictEqual(r.absents.length, 0); assert.strictEqual(r.ok, 1);
});
t('« semigastronómico » (ES, accentué) repéré', () => {
  const fr = page(menu([])); const r = C.controle(caisse(P), { fr, es: page(menu([]), 'cocina semigastronómica'), en: fr, nl: fr });
  assert.ok(r.regles.some(x => x.langue === 'es' && /bistronomique/.test(x.probleme)));
});
t('horaires absents ou en une ligne → « horaires non lus »', () => {
  const r = C.controle(caisse(P), quatre(page(Object.assign(menu([]), { openingHoursSpecification: undefined, openingHours: 'Mo-Su 12:00-22:00' }))));
  assert.ok(r.regles.some(x => /horaires non lus/.test(x.probleme)));
});
t('caisse.html sans carte → erreur claire', () => {
  assert.throws(() => C.controle('<html></html>', quatre(page(menu([])))), /carte intégrée/);
});
t('rapport HTML : échappe le texte du site (pas d\'injection)', () => {
  const r = C.controle(caisse(P), quatre(page(menu([['<img src=x onerror=alert(1)>', '5']]))));
  const h = C.rapportHtml(r); assert.ok(!/<img src=x/.test(h)); assert.ok(/&lt;img/.test(h));
});
t('rapport HTML : « Tout concorde » quand rien à faire', () => {
  const r = C.controle(caisse(P), quatre(page(menu([['Burger italien', '18.90']])))); assert.ok(/Tout concorde/.test(C.rapportHtml(r)));
});
t('vraie caisse : carte lue (≥ 100 produits, aucun caché/supprimé)', () => {
  const l = C.lireCarteCaisse(caisseVraie, []); assert.ok(l.length >= 100); assert.ok(l.every(p => !p.cache && !p.suppr));
});
const docs = process.argv[2];
if (docs && fs.existsSync(docs)) {
  t('vrai site + vraie caisse : 55 plats lus, 4 langues sans écart entre elles, aucune règle enfreinte', () => {
    const pages = {}; C.LANGUES.forEach(l => { pages[l] = fs.readFileSync(path.join(docs, l, 'index.html'), 'utf8'); });
    const eq = JSON.parse(fs.readFileSync(path.join(__dirname, 'equivalences.json'), 'utf8')).noms;
    const t0 = Date.now(); const r = C.controle(caisseVraie, pages, [], eq); const ms = Date.now() - t0;
    assert.strictEqual(r.nbPlats, 55); assert.strictEqual(r.langues.length, 0); assert.strictEqual(r.regles.length, 0); assert.strictEqual(r.ok + r.ecarts.length + r.absents.length + r.aVerifier.length, 55);
    assert.ok(ms < 1000, ms + ' ms');
    console.log('      → ' + r.ok + ' identiques, ' + r.ecarts.length + ' prix différents, ' + r.absents.length + ' introuvable(s), ' + r.aVerifier.length + ' à vérifier (' + ms + ' ms)');
  });
}
console.log(ok + ' ok, ' + ko + ' KO'); process.exit(ko ? 1 : 0);
