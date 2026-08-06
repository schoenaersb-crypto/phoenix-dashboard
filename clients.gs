/* ═══════════════════════════════════════════════════════════════════
   PHOENIX — L'ESPACE CLIENT
   Bloc final de Code.gs. Il remplace intégralement la version du
   6 août au matin : les règles des promotions ont changé.

   ─────────────────────────────────────────────────────────────────
   CE QUI EST CONSERVÉ, ET RIEN D'AUTRE
   Prénom, email, téléphone, jour et mois de naissance. Pas d'adresse
   postale. L'année de naissance n'est pas demandée. Ce qu'on ne
   détient pas ne peut pas fuir.

   COMMENT UN CLIENT PROUVE QUE C'EST LUI
   Email, code à six chiffres, jeton de trente jours. Pas de mot de
   passe : rien à voler, rien à réutiliser ailleurs.

   LES TROIS RÈGLES DES PROMOTIONS
   1. Le lot dépend du MONTANT DE L'ADDITION. Un café pour une
      addition de vingt euros, autre chose pour cent cinquante. Une
      promotion qui ne regarde pas la dépense récompense au hasard ;
      celle-ci récompense ce qui a été dépensé.
   2. Elle n'est utilisable que 24 HEURES APRÈS le scan. C'est ce qui
      fait revenir : on ne peut pas s'en servir sur le repas en cours.
   3. Elle meurt au bout d'UN MOIS. Une promotion sans fin ne
      fidélise personne — c'est l'échéance qui fait revenir.

   Le tirage a lieu ICI, une seule fois, et il est écrit avant d'être
   montré. Le téléphone du client n'affiche que ce qui est déjà
   décidé : recharger la page ne retire pas au sort.
   ═══════════════════════════════════════════════════════════════════ */

var PHX_CLIENTS = 'Clients';
var PHX_PROMOS = 'Promos';
var PHX_CATALOGUE = 'PromosCatalogue';
var PHX_ANNONCES = 'Annonces';

var PHX_DELAI_H = 24;     /* heures avant qu'une promotion soit utilisable */
var PHX_DUREE_J = 30;     /* jours de validité, ensuite elle meurt */

var PHX_ENT_CLIENTS = ['Id', 'Cree', 'Prenom', 'Email', 'Telephone', 'JourNaiss',
  'MoisNaiss', 'Langue', 'Actif', 'Consentement', 'DernierPassage', 'NbPassages',
  'Jeton', 'JetonExpire', 'CodePerso', 'TotalDepense'];
var PHX_ENT_PROMOS = ['Id', 'ClientId', 'Code', 'Libelle', 'Cree', 'Debut', 'Expire',
  'Etat', 'Montant', 'UtiliseeLe', 'UtiliseePar'];
var PHX_ENT_CATALOGUE = ['Libelle', 'Poids', 'MontantMin', 'MontantMax', 'Conditions', 'Actif'];
var PHX_ENT_ANNONCES = ['Date', 'Titre', 'Texte', 'Image', 'Exclusive', 'Actif', 'Jusqu'];

function phxFeuille_(nom, entetes) {
  var ss = SpreadsheetApp.openById(CLASSEUR_ID);
  var f = ss.getSheetByName(nom);
  if (!f) {
    f = ss.insertSheet(nom);
    f.appendRow(entetes);
    f.setFrozenRows(1);
    if (nom === PHX_CATALOGUE) {
      /* Les tranches se recouvrent à dessein : à quatre-vingts euros,
         plusieurs lots sont possibles et c'est le poids qui tranche.
         Le café n'a pas de minimum — il y a donc toujours quelque
         chose à tirer, quel que soit le montant.
         Libellé · poids · min · max · conditions · actif */
      f.appendRow(['Un café offert', 45, '', 39, 'Pour toute table', 'oui']);
      f.appendRow(['Un dessert offert', 30, 25, 89, 'Un par table', 'oui']);
      f.appendRow(['Une coupe de cava offerte', 25, 40, 119, 'Une par personne, jusqu\'à 2', 'oui']);
      f.appendRow(['-10 % sur l\'addition', 14, 60, '', 'Hors menu du jour', 'oui']);
      f.appendRow(['Une entrée offerte', 10, 80, '', 'À partir de 2 personnes', 'oui']);
      f.appendRow(['Un apéritif maison pour toute la table', 6, 110, '', 'Jusqu\'à 6 personnes', 'oui']);
      f.appendRow(['Une bouteille de vin de la maison', 3, 170, '', 'Une par table', 'oui']);
      f.appendRow(['Un café offert', 20, 40, '', 'Pour toute table', 'oui']);
    }
  }
  return f;
}

function phxLignes_(nom, entetes) {
  var f = phxFeuille_(nom, entetes);
  var v = f.getDataRange().getValues();
  var out = [];
  if (v.length < 2) return { f: f, entetes: v[0] || entetes, lignes: out };
  var e = v[0];
  for (var i = 1; i < v.length; i++) {
    var o = { _ligne: i + 1 };
    for (var j = 0; j < e.length; j++) o[String(e[j])] = v[i][j];
    out.push(o);
  }
  return { f: f, entetes: e, lignes: out };
}

function phxColIndex_(entetes, nom) {
  for (var i = 0; i < entetes.length; i++) if (String(entetes[i]) === nom) return i + 1;
  return 0;
}

function phxAlea_(n, jeu) {
  jeu = jeu || 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   /* sans I, O, 0, 1 */
  var s = '';
  for (var i = 0; i < n; i++) s += jeu.charAt(Math.floor(Math.random() * jeu.length));
  return s;
}

function phxEmailValide_(e) {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(String(e || '').trim());
}

function phxDate_(v) {
  if (v instanceof Date) return v;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function phxJour_(d) {
  return d ? Utilities.formatDate(d, 'Europe/Madrid', 'yyyy-MM-dd') : null;
}

/* ═══════════════════════════════════════════════════════════════════
   1. LA CONNEXION
   ═══════════════════════════════════════════════════════════════════ */

function clientDemandeCode(p) {
  var email = String((p && p.email) || '').trim().toLowerCase();
  if (!phxEmailValide_(email)) return { ok: false, error: 'email invalide' };

  var cache = CacheService.getScriptCache();
  /* Pas plus d'un envoi par minute et par adresse : on ne servira pas
     à inonder la boîte de quelqu'un. */
  if (cache.get('phx_envoi_' + email)) return { ok: false, error: 'trop tot' };

  var code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('phx_otp_' + email, JSON.stringify({ code: code, essais: 0 }), 600);
  cache.put('phx_envoi_' + email, '1', 60);

  var corps = [
    'Bonjour,', '',
    'Voici votre code d\'accès à votre espace Brasserie Phoenix :', '',
    '        ' + code, '',
    'Il est valable dix minutes.',
    'Si vous n\'avez rien demandé, ignorez ce message : personne ne peut',
    'entrer sans ce code.', '',
    'L\'équipe de la Brasserie Phoenix',
    'Torrevieja — www.brasseriephoenix.com'
  ].join('\n');

  try {
    MailApp.sendEmail({ to: email, subject: 'Votre code Phoenix : ' + code,
      body: corps, name: 'Brasserie Phoenix' });
  } catch (e) {
    return { ok: false, error: 'envoi impossible' };
  }
  return { ok: true, envoye: true };
}

function clientVerifieCode(p) {
  p = p || {};
  var email = String(p.email || '').trim().toLowerCase();
  var code = String(p.code || '').trim();
  if (!phxEmailValide_(email)) return { ok: false, error: 'email invalide' };

  var cache = CacheService.getScriptCache();
  var brut = cache.get('phx_otp_' + email);
  if (!brut) return { ok: false, error: 'code expire' };
  var etat = JSON.parse(brut);

  if (etat.code !== code) {
    etat.essais = (etat.essais || 0) + 1;
    if (etat.essais >= 5) cache.remove('phx_otp_' + email);
    else cache.put('phx_otp_' + email, JSON.stringify(etat), 600);
    return { ok: false, error: 'code faux', restant: Math.max(0, 5 - etat.essais) };
  }
  cache.remove('phx_otp_' + email);

  var d = phxLignes_(PHX_CLIENTS, PHX_ENT_CLIENTS);
  var moi = null;
  for (var i = 0; i < d.lignes.length; i++) {
    if (String(d.lignes[i].Email).trim().toLowerCase() === email) { moi = d.lignes[i]; break; }
  }

  var jeton = phxAlea_(32, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
  var expire = new Date(Date.now() + 30 * 864e5);

  if (!moi) {
    var id = 'C' + phxAlea_(10);
    d.f.appendRow([id, new Date(), String(p.prenom || '').trim().slice(0, 40), email,
      String(p.telephone || '').trim().slice(0, 25),
      parseInt(p.jour, 10) || '', parseInt(p.mois, 10) || '',
      String(p.langue || 'fr').slice(0, 5), 'oui',
      p.consentement ? 'oui' : 'non', '', 0, jeton, expire, phxAlea_(6), 0]);
    return { ok: true, nouveau: true, jeton: jeton, fiche: clientFicheDe_(id) };
  }

  d.f.getRange(moi._ligne, phxColIndex_(d.entetes, 'Jeton')).setValue(jeton);
  d.f.getRange(moi._ligne, phxColIndex_(d.entetes, 'JetonExpire')).setValue(expire);
  if (!moi.CodePerso) {
    d.f.getRange(moi._ligne, phxColIndex_(d.entetes, 'CodePerso')).setValue(phxAlea_(6));
  }
  return { ok: true, nouveau: false, jeton: jeton, fiche: clientFicheDe_(String(moi.Id)) };
}

function phxClientDuJeton_(jeton) {
  jeton = String(jeton || '');
  if (jeton.length < 20) return null;
  var d = phxLignes_(PHX_CLIENTS, PHX_ENT_CLIENTS);
  for (var i = 0; i < d.lignes.length; i++) {
    var c = d.lignes[i];
    if (String(c.Jeton) !== jeton) continue;
    if (String(c.Actif).toLowerCase() === 'non') return null;
    var exp = phxDate_(c.JetonExpire);
    if (!exp || exp.getTime() < Date.now()) return null;
    c._d = d;
    return c;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   2. LA FICHE
   Un client ne voit que la sienne : rien ici ne prend d'identifiant
   venant du dehors, tout part du jeton.
   ═══════════════════════════════════════════════════════════════════ */

/** L'état d'une promotion à cet instant : à venir, utilisable, morte. */
function phxEtatPromo_(x, maintenant) {
  var etat = String(x.Etat || '');
  if (etat !== 'active') return etat;
  var exp = phxDate_(x.Expire);
  if (exp && exp.getTime() < maintenant) return 'expiree';
  var deb = phxDate_(x.Debut);
  if (deb && deb.getTime() > maintenant) return 'attente';
  return 'utilisable';
}

function clientFicheDe_(clientId) {
  var d = phxLignes_(PHX_CLIENTS, PHX_ENT_CLIENTS);
  var c = null;
  for (var i = 0; i < d.lignes.length; i++) {
    if (String(d.lignes[i].Id) === String(clientId)) { c = d.lignes[i]; break; }
  }
  if (!c) return null;

  var maintenant = Date.now();
  var promos = phxLignes_(PHX_PROMOS, PHX_ENT_PROMOS).lignes.filter(function (x) {
    return String(x.ClientId) === String(clientId);
  });

  var courante = null, passees = [];
  promos.forEach(function (x) {
    var e = phxEtatPromo_(x, maintenant);
    var deb = phxDate_(x.Debut), exp = phxDate_(x.Expire);
    var o = {
      code: String(x.Code), libelle: String(x.Libelle), etat: e,
      debut: phxJour_(deb), expire: phxJour_(exp),
      heuresAvant: (e === 'attente' && deb)
        ? Math.max(1, Math.ceil((deb.getTime() - maintenant) / 36e5)) : 0,
      joursRestants: (e === 'utilisable' && exp)
        ? Math.max(0, Math.ceil((exp.getTime() - maintenant) / 864e5)) : 0
    };
    if ((e === 'utilisable' || e === 'attente') && !courante) courante = o;
    else passees.push(o);
  });

  return {
    prenom: String(c.Prenom || ''), email: String(c.Email || ''),
    telephone: String(c.Telephone || ''),
    jour: c.JourNaiss || null, mois: c.MoisNaiss || null,
    codePerso: String(c.CodePerso || ''),
    passages: Number(c.NbPassages) || 0,
    dernierPassage: phxJour_(phxDate_(c.DernierPassage)),
    promo: courante,
    historique: passees.slice(-6).reverse()
  };
}

function clientFiche(p) {
  var c = phxClientDuJeton_(p && p.jeton);
  if (!c) return { ok: false, error: 'session expiree' };
  return { ok: true, fiche: clientFicheDe_(String(c.Id)),
           annonces: phxAnnonces_(true), reseaux: phxReseauxPublies_() };
}

function clientMaj(p) {
  var c = phxClientDuJeton_(p && p.jeton);
  if (!c) return { ok: false, error: 'session expiree' };
  var d = c._d;
  var champs = { Prenom: 40, Telephone: 25 };
  for (var nom in champs) {
    var clef = nom.toLowerCase();
    if (p[clef] === undefined) continue;
    d.f.getRange(c._ligne, phxColIndex_(d.entetes, nom))
      .setValue(String(p[clef]).trim().slice(0, champs[nom]));
  }
  if (p.jour !== undefined) d.f.getRange(c._ligne, phxColIndex_(d.entetes, 'JourNaiss')).setValue(parseInt(p.jour, 10) || '');
  if (p.mois !== undefined) d.f.getRange(c._ligne, phxColIndex_(d.entetes, 'MoisNaiss')).setValue(parseInt(p.mois, 10) || '');
  return { ok: true, fiche: clientFicheDe_(String(c.Id)) };
}

/** Le droit à l'effacement. Il doit exister, et il doit marcher. */
function clientSupprime(p) {
  var c = phxClientDuJeton_(p && p.jeton);
  if (!c) return { ok: false, error: 'session expiree' };
  var d = c._d;
  ['Prenom', 'Email', 'Telephone', 'JourNaiss', 'MoisNaiss', 'Jeton', 'CodePerso'].forEach(function (n) {
    d.f.getRange(c._ligne, phxColIndex_(d.entetes, n)).setValue('');
  });
  d.f.getRange(c._ligne, phxColIndex_(d.entetes, 'Actif')).setValue('supprime');
  return { ok: true, supprime: true };
}

/* ═══════════════════════════════════════════════════════════════════
   3. LES ANNONCES
   ═══════════════════════════════════════════════════════════════════ */
function phxAnnonces_(avecExclusives) {
  var l = phxLignes_(PHX_ANNONCES, PHX_ENT_ANNONCES).lignes;
  var maintenant = Date.now();
  return l.filter(function (a) {
    if (String(a.Actif).toLowerCase() === 'non') return false;
    if (!avecExclusives && String(a.Exclusive).toLowerCase() === 'oui') return false;
    var j = phxDate_(a.Jusqu);
    if (j && j.getTime() < maintenant) return false;
    return true;
  }).map(function (a) {
    return {
      date: phxJour_(phxDate_(a.Date)) || '', titre: String(a.Titre || ''),
      texte: String(a.Texte || ''), image: String(a.Image || ''),
      exclusive: String(a.Exclusive).toLowerCase() === 'oui'
    };
  }).sort(function (x, y) { return y.date < x.date ? -1 : 1; }).slice(0, 20);
}

/* ═══════════════════════════════════════════════════════════════════
   4. LE PASSAGE EN SALLE
   Un geste de fin de repas : le code du client, le montant, un clic.
   ═══════════════════════════════════════════════════════════════════ */

function phxNombre_(v) {
  var n = parseFloat(String(v == null ? '' : v).replace(',', '.').replace(/[^\d.]/g, ''));
  return isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Tire un lot parmi ceux que le montant de l'addition rend possibles.
 * Un lot sans minimum est toujours possible : il y a donc toujours
 * quelque chose à gagner, même sur une addition modeste.
 */
function phxTirage_(montant) {
  montant = phxNombre_(montant);
  var tous = phxLignes_(PHX_CATALOGUE, PHX_ENT_CATALOGUE).lignes.filter(function (x) {
    return String(x.Actif).toLowerCase() !== 'non' && String(x.Libelle).trim();
  });
  var possibles = tous.filter(function (x) {
    var mn = String(x.MontantMin) === '' ? null : phxNombre_(x.MontantMin);
    var mx = String(x.MontantMax) === '' ? null : phxNombre_(x.MontantMax);
    if (mn !== null && montant < mn) return false;
    if (mx !== null && montant > mx) return false;
    return true;
  });
  /* Filet : si les tranches sont mal réglées et qu'aucun lot ne
     convient, on ne laisse pas le client repartir les mains vides. */
  if (!possibles.length) possibles = tous.filter(function (x) {
    return String(x.MontantMin) === '' || phxNombre_(x.MontantMin) === 0;
  });
  if (!possibles.length) possibles = tous;
  if (!possibles.length) return null;

  var total = 0;
  possibles.forEach(function (x) { total += Math.max(0, Number(x.Poids) || 0); });
  if (total <= 0) return possibles[Math.floor(Math.random() * possibles.length)];
  var r = Math.random() * total;
  for (var i = 0; i < possibles.length; i++) {
    r -= Math.max(0, Number(possibles[i].Poids) || 0);
    if (r <= 0) return possibles[i];
  }
  return possibles[possibles.length - 1];
}

function phxCodePromoLibre_(lignes) {
  var pris = {};
  lignes.forEach(function (x) { pris[String(x.Code)] = 1; });
  for (var i = 0; i < 40; i++) {
    var c = 'PHX-' + phxAlea_(4);
    if (!pris[c]) return c;
  }
  return 'PHX-' + phxAlea_(6);
}

function phxTrouve_(saisi, dc, dp) {
  saisi = String(saisi || '').trim().toUpperCase();
  var promo = null;
  dp.lignes.forEach(function (x) { if (String(x.Code).toUpperCase() === saisi && !promo) promo = x; });
  var cible = promo ? String(promo.ClientId) : null;
  var client = null;
  dc.lignes.forEach(function (c) {
    if (client || String(c.Actif).toLowerCase() === 'supprime') return;
    if (cible ? String(c.Id) === cible : String(c.CodePerso).toUpperCase() === saisi) client = c;
  });
  return client;
}

function phxPromoCourante_(dp, clientId, maintenant) {
  var trouvee = null;
  dp.lignes.forEach(function (x) {
    if (trouvee || String(x.ClientId) !== String(clientId)) return;
    var e = phxEtatPromo_(x, maintenant);
    if (e === 'utilisable' || e === 'attente') { x._etat = e; trouvee = x; }
  });
  return trouvee;
}

/** Ce que la salle voit avant de valider. */
function salleCherche(p) {
  var saisi = String((p && p.code) || '').trim().toUpperCase();
  if (saisi.length < 4) return { ok: false, error: 'code trop court' };
  var dc = phxLignes_(PHX_CLIENTS, PHX_ENT_CLIENTS);
  var dp = phxLignes_(PHX_PROMOS, PHX_ENT_PROMOS);
  var client = phxTrouve_(saisi, dc, dp);
  if (!client) return { ok: false, error: 'code inconnu' };

  var maintenant = Date.now();
  var pr = phxPromoCourante_(dp, String(client.Id), maintenant);
  var deb = pr ? phxDate_(pr.Debut) : null;
  return {
    ok: true,
    prenom: String(client.Prenom || ''),
    passages: Number(client.NbPassages) || 0,
    promo: pr ? {
      libelle: String(pr.Libelle), code: String(pr.Code), etat: pr._etat,
      utilisable: pr._etat === 'utilisable',
      debut: phxJour_(deb),
      heuresAvant: (pr._etat === 'attente' && deb)
        ? Math.max(1, Math.ceil((deb.getTime() - maintenant) / 36e5)) : 0,
      expire: phxJour_(phxDate_(pr.Expire))
    } : null
  };
}

/**
 * @param p { code, montant, utilisee:true|false, employe, code_staff }
 */
function sallePassage(p) {
  p = p || {};
  var saisi = String(p.code || '').trim().toUpperCase();
  if (saisi.length < 4) return { ok: false, error: 'code trop court' };

  var dc = phxLignes_(PHX_CLIENTS, PHX_ENT_CLIENTS);
  var dp = phxLignes_(PHX_PROMOS, PHX_ENT_PROMOS);
  var client = phxTrouve_(saisi, dc, dp);
  if (!client) return { ok: false, error: 'code inconnu' };

  var maintenant = new Date();
  var montant = phxNombre_(p.montant);
  var resume = { prenom: String(client.Prenom || ''), montant: montant,
                 promoUtilisee: null, promoSuivante: null };

  var pr = phxPromoCourante_(dp, String(client.Id), maintenant.getTime());

  /* On ne peut brûler qu'une promotion réellement utilisable : celle
     qui n'a pas encore vingt-quatre heures reste intouchée. */
  if (pr && pr._etat === 'utilisable' && p.utilisee) {
    dp.f.getRange(pr._ligne, phxColIndex_(dp.entetes, 'Etat')).setValue('utilisee');
    dp.f.getRange(pr._ligne, phxColIndex_(dp.entetes, 'UtiliseeLe')).setValue(maintenant);
    dp.f.getRange(pr._ligne, phxColIndex_(dp.entetes, 'UtiliseePar')).setValue(String(p.employe || ''));
    resume.promoUtilisee = String(pr.Libelle);
  } else if (pr) {
    resume.promoEnAttente = String(pr.Libelle);
    resume.promoEtat = pr._etat;
  }

  /* Le passage, et ce qu'il a dépensé. */
  dc.f.getRange(client._ligne, phxColIndex_(dc.entetes, 'DernierPassage')).setValue(maintenant);
  var n = (Number(client.NbPassages) || 0) + 1;
  dc.f.getRange(client._ligne, phxColIndex_(dc.entetes, 'NbPassages')).setValue(n);
  resume.passages = n;
  var cTot = phxColIndex_(dc.entetes, 'TotalDepense');
  if (cTot) {
    var tot = phxNombre_(client.TotalDepense) + montant;
    dc.f.getRange(client._ligne, cTot).setValue(Math.round(tot * 100) / 100);
    resume.totalDepense = Math.round(tot * 100) / 100;
  }

  /* Le tirage pour la prochaine fois. On ne les empile pas : si le
     client repart avec une promotion encore vivante, il la garde. */
  if (!pr || resume.promoUtilisee) {
    var tire = phxTirage_(montant);
    if (tire) {
      var code = phxCodePromoLibre_(dp.lignes);
      var debut = new Date(maintenant.getTime() + PHX_DELAI_H * 36e5);
      var expire = new Date(maintenant.getTime() + PHX_DUREE_J * 864e5);
      dp.f.appendRow(['P' + phxAlea_(8), String(client.Id), code, String(tire.Libelle),
        maintenant, debut, expire, 'active', montant, '', '']);
      resume.promoSuivante = {
        libelle: String(tire.Libelle), code: code,
        conditions: String(tire.Conditions || ''),
        debut: phxJour_(debut), expire: phxJour_(expire),
        delaiHeures: PHX_DELAI_H, dureeJours: PHX_DUREE_J
      };
    }
  }
  return { ok: true, resume: resume };
}
