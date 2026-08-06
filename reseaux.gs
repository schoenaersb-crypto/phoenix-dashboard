/* ═══════════════════════════════════════════════════════════════════
   PHOENIX — LES RÉSEAUX
   Les publications Facebook (et Instagram plus tard) remontées dans
   l'espace client.

   ─────────────────────────────────────────────────────────────────
   POURQUOI ON NE VA PAS CHERCHER EN DIRECT

   Le téléphone du client n'appelle jamais Facebook. C'est le serveur
   qui va chercher, une fois par heure, et qui range le résultat dans
   une feuille du classeur. Trois raisons, et chacune suffirait :

   · le jeton d'accès ne quitte jamais le serveur — il vit dans les
     propriétés du script, jamais dans une page web ;
   · si Facebook est lent, en panne, ou si le jeton meurt, les
     publications déjà rangées restent affichées : l'espace client ne
     tombe pas parce que Meta a éternué ;
   · on ne consomme qu'un appel par heure au lieu d'un par visiteur.

   LE JETON

   Il s'agit d'un « Page Access Token » de longue durée, obtenu par
   l'administrateur de la Page. Tant que l'application Meta reste en
   mode développement et qu'on ne lit que SA PROPRE Page, aucune revue
   Meta n'est nécessaire.

   Ce jeton PEUT expirer — Meta a changé ses règles plusieurs fois. Le
   système est écrit pour que ce soit une gêne et non une panne : les
   dernières publications restent, et une alerte part sur WhatsApp.

   À RENSEIGNER dans Projet ▸ Paramètres ▸ Propriétés du script :
     FB_PAGE_ID      l'identifiant numérique de la Page
     FB_PAGE_TOKEN   le jeton de Page
     IG_USER_ID      (plus tard) le compte Instagram professionnel
     IG_TOKEN        (plus tard)
   ═══════════════════════════════════════════════════════════════════ */

var PHX_RESEAUX = 'Reseaux';
var PHX_ENT_RESEAUX = ['Reseau', 'Id', 'Date', 'Texte', 'Image', 'Lien', 'Recupere', 'Publier'];
var PHX_FB_VERSION = 'v21.0';

function phxProp_(nom) {
  try { return PropertiesService.getScriptProperties().getProperty(nom) || ''; }
  catch (e) { return ''; }
}

function phxFeuilleReseaux_() {
  return phxFeuille_(PHX_RESEAUX, PHX_ENT_RESEAUX);
}

/** Ce que l'espace client affiche : le cache, jamais Facebook en direct. */
function phxReseauxPublies_() {
  var l;
  try { l = phxLignes_(PHX_RESEAUX, PHX_ENT_RESEAUX).lignes; }
  catch (e) { return []; }
  return l.filter(function (r) {
    return String(r.Publier).toLowerCase() !== 'non' && String(r.Texte || r.Image).trim();
  }).map(function (r) {
    return {
      reseau: String(r.Reseau || ''), date: phxJour_(phxDate_(r.Date)) || '',
      texte: String(r.Texte || ''), image: String(r.Image || ''),
      lien: String(r.Lien || '')
    };
  }).sort(function (a, b) { return b.date < a.date ? -1 : 1; }).slice(0, 12);
}

/* ─── L'aller-retour vers Meta ─────────────────────────────────── */
function phxAppelGraph_(chemin, params) {
  var url = 'https://graph.facebook.com/' + PHX_FB_VERSION + '/' + chemin + '?';
  var bouts = [];
  for (var k in params) bouts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
  url += bouts.join('&');
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  var code = r.getResponseCode();
  var txt = r.getContentText();
  var j = null;
  try { j = JSON.parse(txt); } catch (e) { }
  if (code >= 400 || (j && j.error)) {
    return { erreur: (j && j.error && j.error.message) ? j.error.message : ('HTTP ' + code) };
  }
  return j || {};
}

/**
 * Va chercher les publications de la Page et met le cache à jour.
 * Appelée par l'horloge, une fois par heure.
 */
function reseauxRafraichit() {
  var pageId = phxProp_('FB_PAGE_ID');
  var token = phxProp_('FB_PAGE_TOKEN');
  if (!pageId || !token) return { ok: false, error: 'Facebook non configuré' };

  var rep = phxAppelGraph_(pageId + '/posts', {
    fields: 'id,message,created_time,permalink_url,full_picture',
    limit: 15, access_token: token
  });

  if (rep.erreur) {
    /* Le jeton est mort, ou Meta refuse. On ne touche à rien : ce qui
       est déjà rangé reste affiché. Et on prévient. */
    phxAlerteReseaux_('Facebook ne répond plus : ' + rep.erreur
      + '\n\nLes dernières publications restent affichées dans l\'espace client. '
      + 'Il faut refaire un jeton de Page.');
    return { ok: false, error: rep.erreur };
  }

  var posts = rep.data || [];
  var f = phxFeuilleReseaux_();
  var d = phxLignes_(PHX_RESEAUX, PHX_ENT_RESEAUX);
  var connus = {};
  d.lignes.forEach(function (r) { connus[String(r.Reseau) + '|' + String(r.Id)] = r; });

  var neufs = 0;
  posts.forEach(function (p) {
    var clef = 'facebook|' + String(p.id);
    if (connus[clef]) return;
    f.appendRow(['facebook', String(p.id), phxDate_(p.created_time) || new Date(),
      String(p.message || '').slice(0, 1200), String(p.full_picture || ''),
      String(p.permalink_url || ''), new Date(), 'oui']);
    neufs++;
  });

  /* On garde soixante publications : au-delà, personne ne remonte. */
  var total = d.lignes.length + neufs;
  if (total > 60) {
    try { f.deleteRows(2, total - 60); } catch (e) { }
  }
  return { ok: true, recus: posts.length, nouveaux: neufs };
}

function phxAlerteReseaux_(texte) {
  /* Une seule alerte par jour : un jeton mort le reste, inutile de
     sonner toutes les heures. */
  var cache = CacheService.getScriptCache();
  if (cache.get('phx_alerte_reseaux')) return;
  cache.put('phx_alerte_reseaux', '1', 21600);
  try {
    var cfg = (typeof AGENTS_CONFIG !== 'undefined') ? AGENTS_CONFIG : null;
    if (cfg && cfg.EMAIL) {
      MailApp.sendEmail(cfg.EMAIL, 'Phoenix — les réseaux ne répondent plus', texte);
    }
  } catch (e) { }
}

/** Diagnostic à lancer à la main depuis l'éditeur, après avoir posé le jeton. */
function reseauxTeste() {
  var pageId = phxProp_('FB_PAGE_ID');
  var token = phxProp_('FB_PAGE_TOKEN');
  if (!pageId) return { ok: false, error: 'FB_PAGE_ID manquant' };
  if (!token) return { ok: false, error: 'FB_PAGE_TOKEN manquant' };
  var nom = phxAppelGraph_(pageId, { fields: 'name,fan_count', access_token: token });
  if (nom.erreur) return { ok: false, error: nom.erreur };
  var r = reseauxRafraichit();
  return { ok: true, page: nom.name, abonnes: nom.fan_count, rafraichi: r };
}

/* ═══════════════════════════════════════════════════════════════════
   À AJOUTER AU ROUTEUR (une seule ligne) :

     if (body.action === 'reseaux_maj')  { if (!codeOk('ADMIN_CODE', body.code)) return json({ ok: false, error: 'code invalide' }); return json(reseauxRafraichit()); }

   ET UN DÉCLENCHEUR : Apps Script ▸ l'horloge ▸ ajouter un
   déclencheur sur « reseauxRafraichit », toutes les heures.
   ═══════════════════════════════════════════════════════════════════ */
