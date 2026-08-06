/* ═══════════════════════════════════════════════════════════════════
   PHOENIX — LA FRÉQUENTATION DU SITE
   À coller à la fin de Code.gs. Deux lignes à ajouter au routeur
   (elles sont rappelées tout en bas).

   Ce qui est mesuré, et ce qui ne l'est pas — c'est le point le plus
   important de ce fichier.

   MESURÉ : la page ouverte, le moment, d'où vient le visiteur (le
   domaine référent, pas l'adresse complète), la langue de son
   navigateur, son fuseau horaire, le type d'appareil, la largeur de
   l'écran, et le temps passé sur la page.

   PAS MESURÉ : aucune adresse IP — Apps Script ne la reçoit même
   pas —, aucun cookie, aucun identifiant qui survive à la fermeture
   de l'onglet. L'identifiant de session vit dans le sessionStorage
   du navigateur et meurt avec l'onglet.

   Conséquence pratique : pas de bandeau de consentement à afficher.
   Ce n'est pas un détail de confort — c'est ce qui distingue une
   mesure d'audience licite d'un traçage qui exigerait le
   consentement explicite de chaque visiteur.
   ═══════════════════════════════════════════════════════════════════ */

var PHX_VISITES_FEUILLE = 'Visites';
var PHX_VISITES_ENTETES = ['Horodatage', 'Type', 'Session', 'Page', 'Source',
  'Langue', 'Fuseau', 'Appareil', 'Largeur', 'Duree_s'];

function phxFeuilleVisites_() {
  var ss = SpreadsheetApp.openById(CLASSEUR_ID);
  var f = ss.getSheetByName(PHX_VISITES_FEUILLE);
  if (!f) {
    f = ss.insertSheet(PHX_VISITES_FEUILLE);
    f.appendRow(PHX_VISITES_ENTETES);
    f.setFrozenRows(1);
  }
  return f;
}

/* Tout ce qui arrive de l'extérieur est coupé et nettoyé avant
   d'entrer dans le classeur : la page est publique, n'importe qui
   peut appeler cette route. */
function phxPropre_(v, max) {
  return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').slice(0, max || 120);
}

/**
 * Enregistre une vue de page ou une fin de visite.
 * Ne renvoie presque rien : le navigateur n'attend pas la réponse.
 */
function visiteEcrit(p) {
  p = p || {};
  var type = (p.type === 'fin') ? 'fin' : 'vue';
  var duree = Number(p.duree);
  if (!isFinite(duree) || duree < 0 || duree > 86400) duree = 0;
  var largeur = parseInt(p.largeur, 10);
  if (!isFinite(largeur) || largeur < 0 || largeur > 20000) largeur = 0;

  /* On ne garde que le domaine du référent, jamais l'adresse
     complète : elle peut contenir une recherche, donc une intention. */
  var source = phxPropre_(p.source, 80).replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
  if (!source) source = 'direct';

  phxFeuilleVisites_().appendRow([
    new Date(), type, phxPropre_(p.sid, 40), phxPropre_(p.page, 80), source,
    phxPropre_(p.langue, 12), phxPropre_(p.fuseau, 50),
    phxPropre_(p.appareil, 12), largeur, Math.round(duree)
  ]);
  return { ok: true };
}

/* ─── Les statistiques ─────────────────────────────────────────── */

function phxJourLocal_(d) {
  return Utilities.formatDate(d, 'Europe/Madrid', 'yyyy-MM-dd');
}

/**
 * Agrège la fréquentation sur une période.
 * @param {Object} p { depuis:'yyyy-MM-dd', jusqu:'yyyy-MM-dd' }
 */
function visitesStats(p) {
  p = p || {};
  var ss = SpreadsheetApp.openById(CLASSEUR_ID);
  var f = ss.getSheetByName(PHX_VISITES_FEUILLE);
  if (!f) return { ok: true, vide: true, depuis: p.depuis || null, jusqu: p.jusqu || null,
                   parJour: [], parPage: [], parSource: [], parLangue: [], parAppareil: [],
                   parHeure: [], vues: 0, sessions: 0, dureeMediane: 0, debut: null };

  var val = f.getDataRange().getValues();
  if (val.length < 2) return { ok: true, vide: true, parJour: [], parPage: [], parSource: [],
                               parLangue: [], parAppareil: [], parHeure: [], vues: 0,
                               sessions: 0, dureeMediane: 0, debut: null };

  var dep = p.depuis || '0000-00-00', jus = p.jusqu || '9999-99-99';
  var parJour = {}, parPage = {}, parSource = {}, parLangue = {}, parAppareil = {};
  var parHeure = [], i;
  for (i = 0; i < 24; i++) parHeure.push(0);
  var sessions = {}, durees = [], vues = 0, premier = null;

  for (i = 1; i < val.length; i++) {
    var r = val[i];
    var d = (r[0] instanceof Date) ? r[0] : new Date(r[0]);
    if (isNaN(d.getTime())) continue;
    if (!premier || d < premier) premier = d;
    var jour = phxJourLocal_(d);
    if (jour < dep || jour > jus) continue;

    var type = String(r[1] || 'vue');
    var sid = String(r[2] || '');
    var page = String(r[3] || '?');
    var source = String(r[4] || 'direct');
    var langue = String(r[5] || '?').slice(0, 2).toLowerCase();
    var appareil = String(r[7] || '?');
    var duree = Number(r[9]) || 0;

    if (type === 'fin') { if (duree > 0 && duree < 7200) durees.push(duree); continue; }

    vues++;
    if (!parJour[jour]) parJour[jour] = { vues: 0, sessions: {} };
    parJour[jour].vues++;
    if (sid) { parJour[jour].sessions[sid] = 1; sessions[sid] = 1; }
    parPage[page] = (parPage[page] || 0) + 1;
    parSource[source] = (parSource[source] || 0) + 1;
    parLangue[langue] = (parLangue[langue] || 0) + 1;
    parAppareil[appareil] = (parAppareil[appareil] || 0) + 1;
    parHeure[d.getHours()]++;
  }

  function classe(o) {
    return Object.keys(o).map(function (k) { return { nom: k, n: o[k] }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 12);
  }
  durees.sort(function (a, b) { return a - b; });

  return {
    ok: true,
    depuis: p.depuis || null, jusqu: p.jusqu || null,
    debut: premier ? phxJourLocal_(premier) : null,
    vues: vues,
    sessions: Object.keys(sessions).length,
    dureeMediane: durees.length ? durees[Math.floor(durees.length / 2)] : 0,
    parJour: Object.keys(parJour).sort().map(function (j) {
      return { d: j, vues: parJour[j].vues, sessions: Object.keys(parJour[j].sessions).length };
    }),
    parPage: classe(parPage), parSource: classe(parSource),
    parLangue: classe(parLangue), parAppareil: classe(parAppareil),
    parHeure: parHeure
  };
}

/* ═══════════════════════════════════════════════════════════════════
   À AJOUTER AU ROUTEUR, exactement dans cette forme — les lignes
   voisines testent « body.action », pas « action » :

     if (body.action === 'visite')        return json(visiteEcrit(body));
     if (body.action === 'visites_stats') return json(visitesStats(body));

   La première doit rester PUBLIQUE (aucun code) : c'est le navigateur
   du visiteur qui l'appelle. La seconde ne rend que des chiffres
   agrégés, jamais une ligne individuelle.
   ═══════════════════════════════════════════════════════════════════ */
