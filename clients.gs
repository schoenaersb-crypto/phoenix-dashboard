/* ═══════════════════════════════════════════════════════════════════
   PHOENIX — L'ESPACE CLIENT
   À coller à la fin de Code.gs. Les lignes du routeur sont rappelées
   tout en bas.

   ─────────────────────────────────────────────────────────────────
   CE QUI EST CONSERVÉ, ET RIEN D'AUTRE
   Prénom, email, téléphone, jour et mois de naissance. Pas d'adresse
   postale. L'année de naissance n'est pas demandée. C'est la règle
   que Bastien a posée, et elle est aussi la meilleure protection :
   ce qu'on ne détient pas ne peut pas fuir.

   COMMENT UN CLIENT PROUVE QUE C'EST LUI
   Il donne son email, reçoit un code à six chiffres, le saisit. Pas
   de mot de passe — donc rien à voler, rien à réutiliser ailleurs.
   Le code vit dix minutes et meurt au premier usage. Ensuite il
   reçoit un jeton, valable trente jours, rangé sur son téléphone.

   LES PROMOTIONS
   Elles ne sont JAMAIS tirées par le téléphone du client : le
   téléphone ne fait qu'afficher ce que le serveur a déjà décidé.
   Sinon il suffirait de recharger la page pour retirer au sort
   jusqu'à tomber sur la meilleure. Le tirage se fait ici, une seule
   fois, et il est écrit avant d'être montré.

   Une promotion porte un code unique. Elle est brûlée en salle par
   un membre de l'équipe. Une capture d'écran ne vaut rien : c'est
   l'état côté serveur qui décide, pas l'image sur le téléphone.
   ═══════════════════════════════════════════════════════════════════ */

var PHX_CLIENTS = 'Clients';
var PHX_PROMOS = 'Promos';
var PHX_CATALOGUE = 'PromosCatalogue';
var PHX_ANNONCES = 'Annonces';

var PHX_ENT_CLIENTS = ['Id', 'Cree', 'Prenom', 'Email', 'Telephone', 'JourNaiss',
  'MoisNaiss', 'Langue', 'Actif', 'Consentement', 'DernierPassage', 'NbPassages',
  'Jeton', 'JetonExpire', 'CodePerso'];
var PHX_ENT_PROMOS = ['Id', 'ClientId', 'Code', 'Libelle', 'Cree', 'Expire',
  'Etat', 'UtiliseeLe', 'UtiliseePar'];
var PHX_ENT_CATALOGUE = ['Libelle', 'Poids', 'Conditions', 'Actif'];
var PHX_ENT_ANNONCES = ['Date', 'Titre', 'Texte', 'Image', 'Exclusive', 'Actif', 'Jusqu'];

function phxFeuille_(nom, entetes) {
  var ss = SpreadsheetApp.openById(CLASSEUR_ID);
  var f = ss.getSheetByName(nom);
  if (!f) {
    f = ss.insertSheet(nom);
    f.appendRow(entetes);
    f.setFrozenRows(1);
    if (nom === PHX_CATALOGUE) {
      /* Un catalogue vide ne tire rien : on pose de quoi démarrer.
         Bastien change les libellés et les poids directement dans la
         feuille, sans passer par personne. Poids = chances relatives. */
      f.appendRow(['Un café offert', 40, 'Pour toute table', 'oui']);
      f.appendRow(['Une coupe de cava offerte', 20, 'À partir de 2 personnes', 'oui']);
      f.appendRow(['Un dessert offert', 20, 'Un par table', 'oui']);
      f.appendRow(['-10 % sur l\'addition', 12, 'Hors menu du jour', 'oui']);
      f.appendRow(['Une entrée offerte', 6, 'À partir de 2 personnes', 'oui']);
      f.appendRow(['Un apéritif maison pour toute la table', 2, 'Jusqu\'à 6 personnes', 'oui']);
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

/* ═══════════════════════════════════════════════════════════════════
   1. LA CONNEXION
   ═══════════════════════════════════════════════════════════════════ */

/** Envoie un code à six chiffres par mail. */
function clientDemandeCode(p) {
  var email = String((p && p.email) || '').trim().toLowerCase();
  if (!phxEmailValide_(email)) return { ok: false, error: 'email invalide' };

  var cache = CacheService.getScriptCache();

  /* Garde-fou : pas plus d'un envoi par minute et par adresse, pour
     qu'on ne se serve pas de nous pour inonder la boîte de quelqu'un. */
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
    MailApp.sendEmail({
      to: email,
      subject: 'Votre code Phoenix : ' + code,
      body: corps,
      name: 'Brasserie Phoenix'
    });
  } catch (e) {
    return { ok: false, error: 'envoi impossible' };
  }
  return { ok: true, envoye: true };
}

/** Vérifie le code, crée le compte au besoin, rend un jeton. */
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
    /* Cinq essais et le code meurt : six chiffres se devinent, si on
       laisse essayer sans fin. */
    if (etat.essais >= 5) cache.remove('phx_otp_' + email);
    else cache.put('phx_otp_' + email, JSON.stringify(etat), 600);
    return { ok: false, error: 'code faux', restant: Math.max(0, 5 - etat.essais) };
  }
  cache.remove('phx_otp_' + email);   /* un code ne sert qu'une fois */

  var d = phxLignes_(PHX_CLIENTS, PHX_ENT_CLIENTS);
  var moi = null;
  for (var i = 0; i < d.lignes.length; i++) {
    if (String(d.lignes[i].Email).trim().toLowerCase() === email) { moi = d.lignes[i]; break; }
  }

  var jeton = phxAlea_(32, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
  var expire = new Date(Date.now() + 30 * 864e5);

  if (!moi) {
    var id = 'C' + phxAlea_(10);
    var codePerso = phxAlea_(6);
    d.f.appendRow([id, new Date(), String(p.prenom || '').trim().slice(0, 40), email,
      String(p.telephone || '').trim().slice(0, 25),
      parseInt(p.jour, 10) || '', parseInt(p.mois, 10) || '',
      String(p.langue || 'fr').slice(0, 5), 'oui',
      p.consentement ? 'oui' : 'non', '', 0, jeton, expire, codePerso]);
    return { ok: true, nouveau: true, jeton: jeton, fiche: clientFicheDe_(id) };
  }

  var cJ = phxColIndex_(d.entetes, 'Jeton');
  var cE = phxColIndex_(d.entetes, 'JetonExpire');
  d.f.getRange(moi._ligne, cJ).setValue(jeton);
  d.f.getRange(moi._ligne, cE).setValue(expire);
  if (!moi.CodePerso) {
    d.f.getRange(moi._ligne, phxColIndex_(d.entetes, 'CodePerso')).setValue(phxAlea_(6));
  }
  return { ok: true, nouveau: false, jeton: jeton, fiche: clientFicheDe_(String(moi.Id)) };
}

/** Retrouve le client d'un jeton. Rend null si le jeton ne vaut rien. */
function phxClientDuJeton_(jeton) {
  jeton = String(jeton || '');
  if (jeton.length < 20) return null;
  var d = phxLignes_(PHX_CLIENTS, PHX_ENT_CLIENTS);
  for (var i = 0; i < d.lignes.length; i++) {
    var c = d.lignes[i];
    if (String(c.Jeton) !== jeton) continue;
    if (String(c.Actif).toLowerCase() === 'non') return null;
    var exp = c.JetonExpire instanceof Date ? c.JetonExpire : new Date(c.JetonExpire);
    if (isNaN(exp.getTime()) || exp.getTime() < Date.now()) return null;
    c._d = d;
    return c;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   2. LA FICHE
   Un client ne voit QUE la sienne. Rien dans cette fonction ne prend
   d'identifiant venant du dehors : on part du jeton, et de lui seul.
   ═══════════════════════════════════════════════════════════════════ */

function clientFicheDe_(clientId) {
  var d = phxLignes_(PHX_CLIENTS, PHX_ENT_CLIENTS);
  var c = null;
  for (var i = 0; i < d.lignes.length; i++) {
    if (String(d.lignes[i].Id) === String(clientId)) { c = d.lignes[i]; break; }
  }
  if (!c) return null;

  var promos = phxLignes_(PHX_PROMOS, PHX_ENT_PROMOS).lignes.filter(function (x) {
    return String(x.ClientId) === String(clientId);
  });
  var maintenant = Date.now();
  var active = null, passees = [];
  promos.forEach(function (x) {
    var exp = x.Expire instanceof Date ? x.Expire : new Date(x.Expire);
    var perimee = !isNaN(exp.getTime()) && exp.getTime() < maintenant;
    var o = {
      code: String(x.Code), libelle: String(x.Libelle),
      expire: isNaN(exp.getTime()) ? null : Utilities.formatDate(exp, 'Europe/Madrid', 'yyyy-MM-dd'),
      etat: perimee && String(x.Etat) === 'active' ? 'expiree' : String(x.Etat)
    };
    if (o.etat === 'active' && !active) active = o; else passees.push(o);
  });

  return {
    prenom: String(c.Prenom || ''), email: String(c.Email || ''),
    telephone: String(c.Telephone || ''),
    jour: c.JourNaiss || null, mois: c.MoisNaiss || null,
    codePerso: String(c.CodePerso || ''),
    passages: Number(c.NbPassages) || 0,
    dernierPassage: c.DernierPassage instanceof Date
      ? Utilities.formatDate(c.DernierPassage, 'Europe/Madrid', 'yyyy-MM-dd') : null,
    promo: active,
    historique: passees.slice(-6).reverse()
  };
}

function clientFiche(p) {
  var c = phxClientDuJeton_(p && p.jeton);
  if (!c) return { ok: false, error: 'session expiree' };
  return { ok: true, fiche: clientFicheDe_(String(c.Id)), annonces: phxAnnonces_(true) };
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
  /* On efface les données personnelles et on coupe l'accès. La ligne
     reste, vidée, pour ne pas décaler l'historique des promotions. */
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
    if (a.Jusqu) {
      var j = a.Jusqu instanceof Date ? a.Jusqu : new Date(a.Jusqu);
      if (!isNaN(j.getTime()) && j.getTime() < maintenant) return false;
    }
    return true;
  }).map(function (a) {
    var d = a.Date instanceof Date ? a.Date : new Date(a.Date);
    return {
      date: isNaN(d.getTime()) ? '' : Utilities.formatDate(d, 'Europe/Madrid', 'yyyy-MM-dd'),
      titre: String(a.Titre || ''), texte: String(a.Texte || ''),
      image: String(a.Image || ''),
      exclusive: String(a.Exclusive).toLowerCase() === 'oui'
    };
  }).sort(function (x, y) { return y.date < x.date ? -1 : 1; }).slice(0, 20);
}

/* ═══════════════════════════════════════════════════════════════════
   4. LE PASSAGE EN SALLE
   Le geste de fin de repas : un membre de l'équipe saisit le code du
   client. Ce seul geste fait trois choses — il brûle la promotion en
   cours si elle a servi, il compte le passage, et il tire celle de la
   prochaine fois.
   ═══════════════════════════════════════════════════════════════════ */

function phxTirage_() {
  var l = phxLignes_(PHX_CATALOGUE, PHX_ENT_CATALOGUE).lignes.filter(function (x) {
    return String(x.Actif).toLowerCase() !== 'non' && String(x.Libelle).trim();
  });
  if (!l.length) return null;
  var total = 0;
  l.forEach(function (x) { total += Math.max(0, Number(x.Poids) || 0); });
  if (total <= 0) return l[Math.floor(Math.random() * l.length)];
  var r = Math.random() * total;
  for (var i = 0; i < l.length; i++) {
    r -= Math.max(0, Number(l[i].Poids) || 0);
    if (r <= 0) return l[i];
  }
  return l[l.length - 1];
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

/**
 * @param p { code:'ABC123' (code perso) ou 'PHX-XXXX' (code promo),
 *            employe, codeStaff, utilisee:true|false }
 */
function sallePassage(p) {
  p = p || {};
  var saisi = String(p.code || '').trim().toUpperCase();
  if (saisi.length < 4) return { ok: false, error: 'code trop court' };

  var dc = phxLignes_(PHX_CLIENTS, PHX_ENT_CLIENTS);
  var dp = phxLignes_(PHX_PROMOS, PHX_ENT_PROMOS);

  /* Le code saisi peut être celui du client ou celui d'une promotion :
     en salle, on ne veut pas avoir à se demander lequel c'est. */
  var client = null, promoVisee = null;
  for (var i = 0; i < dp.lignes.length; i++) {
    if (String(dp.lignes[i].Code).toUpperCase() === saisi) { promoVisee = dp.lignes[i]; break; }
  }
  var cible = promoVisee ? String(promoVisee.ClientId) : null;
  for (var j = 0; j < dc.lignes.length; j++) {
    var c = dc.lignes[j];
    if (String(c.Actif).toLowerCase() === 'supprime') continue;
    if (cible ? String(c.Id) === cible : String(c.CodePerso).toUpperCase() === saisi) { client = c; break; }
  }
  if (!client) return { ok: false, error: 'code inconnu' };

  var maintenant = new Date();
  var resume = { prenom: String(client.Prenom || ''), promoUtilisee: null, promoSuivante: null };

  /* On brûle la promotion en cours si l'équipe dit qu'elle a servi. */
  var active = null;
  dp.lignes.forEach(function (x) {
    if (String(x.ClientId) !== String(client.Id) || String(x.Etat) !== 'active') return;
    var e = x.Expire instanceof Date ? x.Expire : new Date(x.Expire);
    if (!isNaN(e.getTime()) && e.getTime() < maintenant.getTime()) return;
    if (!active) active = x;
  });
  if (active && p.utilisee) {
    dp.f.getRange(active._ligne, phxColIndex_(dp.entetes, 'Etat')).setValue('utilisee');
    dp.f.getRange(active._ligne, phxColIndex_(dp.entetes, 'UtiliseeLe')).setValue(maintenant);
    dp.f.getRange(active._ligne, phxColIndex_(dp.entetes, 'UtiliseePar')).setValue(String(p.employe || ''));
    resume.promoUtilisee = String(active.Libelle);
  } else if (active) {
    resume.promoEnAttente = String(active.Libelle);
  }

  /* Le passage. */
  dc.f.getRange(client._ligne, phxColIndex_(dc.entetes, 'DernierPassage')).setValue(maintenant);
  dc.f.getRange(client._ligne, phxColIndex_(dc.entetes, 'NbPassages'))
    .setValue((Number(client.NbPassages) || 0) + 1);
  resume.passages = (Number(client.NbPassages) || 0) + 1;

  /* Le tirage pour la prochaine fois — seulement s'il n'a pas déjà
     une promotion qui l'attend, pour qu'elles ne s'empilent pas. */
  if (!active || p.utilisee) {
    var tire = phxTirage_();
    if (tire) {
      var code = phxCodePromoLibre_(dp.lignes);
      var expire = new Date(maintenant.getTime() + 90 * 864e5);
      dp.f.appendRow(['P' + phxAlea_(8), String(client.Id), code, String(tire.Libelle),
        maintenant, expire, 'active', '', '']);
      resume.promoSuivante = { libelle: String(tire.Libelle), code: code,
        conditions: String(tire.Conditions || ''),
        expire: Utilities.formatDate(expire, 'Europe/Madrid', 'yyyy-MM-dd') };
    }
  }
  return { ok: true, resume: resume };
}

/** Ce que la salle voit avant de valider : qui c'est, ce qu'il a. */
function salleCherche(p) {
  var saisi = String((p && p.code) || '').trim().toUpperCase();
  if (saisi.length < 4) return { ok: false, error: 'code trop court' };
  var dc = phxLignes_(PHX_CLIENTS, PHX_ENT_CLIENTS);
  var dp = phxLignes_(PHX_PROMOS, PHX_ENT_PROMOS);
  var promo = null;
  dp.lignes.forEach(function (x) { if (String(x.Code).toUpperCase() === saisi && !promo) promo = x; });
  var cible = promo ? String(promo.ClientId) : null;
  var client = null;
  dc.lignes.forEach(function (c) {
    if (client || String(c.Actif).toLowerCase() === 'supprime') return;
    if (cible ? String(c.Id) === cible : String(c.CodePerso).toUpperCase() === saisi) client = c;
  });
  if (!client) return { ok: false, error: 'code inconnu' };

  var maintenant = Date.now(), active = null;
  dp.lignes.forEach(function (x) {
    if (String(x.ClientId) !== String(client.Id) || String(x.Etat) !== 'active' || active) return;
    var e = x.Expire instanceof Date ? x.Expire : new Date(x.Expire);
    if (!isNaN(e.getTime()) && e.getTime() < maintenant) return;
    active = x;
  });
  return {
    ok: true,
    prenom: String(client.Prenom || ''),
    passages: Number(client.NbPassages) || 0,
    promo: active ? { libelle: String(active.Libelle), code: String(active.Code) } : null
  };
}

/* ═══════════════════════════════════════════════════════════════════
   À AJOUTER AU ROUTEUR — la forme compte, les voisines testent
   « body.action » :

     if (body.action === 'client_code')     return json(clientDemandeCode(body));
     if (body.action === 'client_verifie')  return json(clientVerifieCode(body));
     if (body.action === 'client_fiche')    return json(clientFiche(body));
     if (body.action === 'client_maj')      return json(clientMaj(body));
     if (body.action === 'client_supprime') return json(clientSupprime(body));
     if (body.action === 'salle_cherche')   { if (!codeOk('ADMIN_CODE', body.code_staff) && !accesOk(body.employe, body.code_staff)) return json({ ok: false, error: 'code invalide' }); return json(salleCherche(body)); }
     if (body.action === 'salle_passage')   { if (!codeOk('ADMIN_CODE', body.code_staff) && !accesOk(body.employe, body.code_staff)) return json({ ok: false, error: 'code invalide' }); return json(sallePassage(body)); }

   Les cinq premières sont publiques À DESSEIN : c'est le navigateur du
   client qui les appelle, et chacune se protège elle-même par le code
   reçu par mail puis par le jeton. Les deux dernières appartiennent à
   l'équipe et exigent un code.
   ═══════════════════════════════════════════════════════════════════ */
