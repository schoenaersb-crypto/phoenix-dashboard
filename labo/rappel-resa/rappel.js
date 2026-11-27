/* Labo — Rappels de réservation en un appui (prototype, 27/11/2026).
   Lit les lignes de l'onglet Reservations, enlève les doublons, garde le
   meilleur contact, choisit la langue du client et prépare le message de
   rappel (WhatsApp ou e-mail). RIEN n'est envoyé : c'est la personne de
   l'équipe qui appuie, et l'application WhatsApp/e-mail s'ouvre avec le texte.
   Fonctionne dans le navigateur (window.Rappel) et sous node (module.exports). */
(function (racine) {
  'use strict';

  var NOTRE_EMAIL = 'brasseriephoenixrestaurant@gmail.com';
  var NOTRE_TEL = '34744622975';
  var LANGS = ['fr', 'es', 'en', 'nl'];

  var JOURS = {
    fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
    es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    nl: ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']
  };
  var MOIS = {
    fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    nl: ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
  };

  /* Date du jour à Madrid, en chaîne AAAA-MM-JJ (jamais toISOString : leçon du 26/11). */
  function aujourdhui(maintenant) {
    var d = maintenant || new Date();
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
    return o.year + '-' + o.month + '-' + o.day;
  }
  function jourSemaine(iso) { var a = iso.split('-').map(Number); return new Date(Date.UTC(a[0], a[1] - 1, a[2], 12)).getUTCDay(); }
  function ajouterJours(iso, n) {
    var a = iso.split('-').map(Number); var d = new Date(Date.UTC(a[0], a[1] - 1, a[2] + n, 12));
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }
  function dateValide(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false;
    var a = iso.split('-').map(Number);
    if (a[1] < 1 || a[1] > 12 || a[2] < 1 || a[2] > 31) return false;
    return ajouterJours(iso, 0) === iso;
  }

  /* Jours à rappeler aujourd'hui : demain ; le mercredi est fermé, donc le
     mardi on rappelle aussi jeudi (personne ne travaille le mercredi pour le faire). */
  function joursCibles(auj) {
    var demain = ajouterJours(auj, 1);
    var j = jourSemaine(auj);
    if (j === 3) return [];                       /* mercredi : restaurant fermé, pas de rappels */
    if (j === 2) return [ajouterJours(auj, 2)];   /* mardi : demain mercredi fermé -> jeudi */
    return [demain];
  }

  function normNom(n) {
    return String(n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
  }

  /* Contact -> {type:'wa'|'email'|'incomplet'|'aucun', valeur, motif} */
  function lireContact(c) {
    var s = String(c == null ? '' : c).trim();
    if (!s || s === '#ERROR!' || /^#[A-Z\/0!?]+/.test(s)) return { type: 'aucun', motif: s ? 'erreur du classeur (' + s + ')' : 'pas de contact' };
    if (/@/.test(s)) {
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s)) return { type: 'aucun', motif: 'e-mail illisible' };
      if (s.toLowerCase() === NOTRE_EMAIL) return { type: 'aucun', motif: 'c\'est notre propre adresse' };
      return { type: 'email', valeur: s };
    }
    var chiffres = s.replace(/^\+/, '').replace(/^00/, '').replace(/[\s.\-()\/]/g, '');
    if (!/^\d+$/.test(chiffres)) return { type: 'aucun', motif: 'numéro illisible' };
    if (chiffres === NOTRE_TEL) return { type: 'aucun', motif: 'c\'est notre propre numéro' };
    if (/^[67]\d{8}$/.test(chiffres)) return { type: 'wa', valeur: '34' + chiffres, devine: true }; /* mobile espagnol sans indicatif */
    if (chiffres.length >= 10 && chiffres.length <= 15 && chiffres[0] !== '0') return { type: 'wa', valeur: chiffres };
    return { type: 'incomplet', valeur: s, motif: 'numéro sans indicatif pays' };
  }
  function scoreContact(k) { return { wa: 3, email: 2, incomplet: 1, aucun: 0 }[k.type]; }

  var MOTS_NL = /\b(met|zonder|avond|graag|alstublieft|bedankt|personen|tafel|degustatiemenu|muzikale|nog|niet|bevestigd)\b|\d+u\b/i;
  var MOTS_ES = /\b(gracias|por favor|mesa|personas|cena|comida|perro)\b/i;
  var MOTS_FR = /\b(merci|bonjour|chien|toujours|accept[ée]|table|personnes|svp)\b/i;
  var MOTS_EN = /\b(please|thanks|thank you|dog|table for|birthday|allerg)\b/i;

  /* Langue : 1) la note du client, 2) l'indicatif du numéro, 3) anglais. */
  function langue(r, contact) {
    var note = String(r.note || '');
    if (MOTS_NL.test(note)) return 'nl';
    if (MOTS_ES.test(note)) return 'es';
    if (MOTS_FR.test(note)) return 'fr';
    if (MOTS_EN.test(note)) return 'en';
    if (contact && contact.type === 'wa') {
      var v = contact.valeur;
      if (/^34/.test(v)) return 'es';
      if (/^31/.test(v)) return 'nl';
      if (/^(33|352|377)/.test(v)) return 'fr';
      if (/^32/.test(v)) return 'nl';   /* Belgique : NL par défaut, modifiable d'un appui */
      if (/^(44|353|1|46|47|45|358|49)/.test(v)) return 'en';
    }
    return 'en';
  }

  /* Lignes brutes (tableau de tableaux, en-tête compris, ou objets) -> réservations uniques. */
  function preparer(lignes) {
    var tete = null, rows = lignes || [];
    if (rows.length && Array.isArray(rows[0])) {
      tete = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
      rows = rows.slice(1).map(function (l) { var o = {}; tete.forEach(function (h, i) { o[h] = l[i]; }); return o; });
    }
    var groupes = {}, ordre = [], ignorees = [];
    rows.forEach(function (o, i) {
      var r = {
        date: String(o.date || '').trim(), heure: String(o.heure || '').trim(),
        couverts: parseInt(o.couverts, 10) || 0, nom: String(o.nom || '').trim(),
        contact: o.contact, statut: String(o.statut || '').trim(), note: String(o.note || '').trim(), ligne: i + 2
      };
      if (!dateValide(r.date) || !/^\d{1,2}:\d{2}$/.test(r.heure)) { ignorees.push({ ligne: r.ligne, motif: 'date ou heure illisible' }); return; }
      if (/annul/i.test(r.statut)) { ignorees.push({ ligne: r.ligne, motif: 'annulée' }); return; }
      var k = r.date + '|' + r.heure + '|' + normNom(r.nom);
      if (!groupes[k]) { groupes[k] = []; ordre.push(k); }
      groupes[k].push(r);
    });
    /* Ligne au nom générique (« Client », vide) : rattachée à la seule autre réservation du même créneau. */
    ordre = ordre.filter(function (k) {
      var nn = k.split('|')[2];
      if (nn && nn !== 'client') return true;
      var pref = k.split('|').slice(0, 2).join('|') + '|';
      var autres = ordre.filter(function (x) { return x !== k && x.indexOf(pref) === 0 && x.split('|')[2] && x.split('|')[2] !== 'client'; });
      if (autres.length !== 1) return true;
      groupes[autres[0]] = groupes[autres[0]].concat(groupes[k]);
      return false;
    });
    var res = ordre.map(function (k) {
      var g = groupes[k], best = null;
      g.forEach(function (r) { var c = lireContact(r.contact); if (!best || scoreContact(c) > scoreContact(best.c)) best = { r: r, c: c }; });
      var confirmee = g.some(function (r) { return /confirm/i.test(r.statut); });
      var notes = []; g.forEach(function (r) { if (r.note && notes.indexOf(r.note) < 0) notes.push(r.note); });
      var nom = g.map(function (r) { return r.nom; }).filter(function (n) { return n && !/^client$/i.test(n); })[0] || g[0].nom || '';
      var couverts = Math.max.apply(null, g.map(function (r) { return r.couverts; }));
      var base = { date: g[0].date, heure: g[0].heure, nom: nom, couverts: couverts, note: notes.join(' · '),
        confirmee: confirmee, contact: best.c, lignes: g.map(function (r) { return r.ligne; }) };
      base.langue = langue({ note: base.note }, best.c);
      return base;
    });
    return { reservations: res, ignorees: ignorees };
  }

  function prenomPoli(nom) { var n = String(nom || '').trim(); return n && !/^(client|phoenix)/i.test(n) ? n : ''; }

  function message(r, lang, auj) {
    lang = LANGS.indexOf(lang) >= 0 ? lang : 'en';
    var j = jourSemaine(r.date), a = r.date.split('-').map(Number);
    var quand = (lang === 'en' ? JOURS.en[j] + ' ' + a[2] + ' ' + MOIS.en[a[1] - 1]
      : JOURS[lang][j] + ' ' + a[2] + (lang === 'es' ? ' de ' : ' ') + MOIS[lang][a[1] - 1]);
    var demain = auj && ajouterJours(auj, 1) === r.date;
    var n = r.couverts, nom = prenomPoli(r.nom), h = r.heure;
    var adr = 'Av. Desiderio Rodríguez 37, Torrevieja';
    if (lang === 'fr') return 'Bonjour' + (nom ? ' ' + nom : '') + ', nous vous attendons ' + (demain ? 'demain, ' : '') + quand + ' à ' + h + (n ? ' pour ' + n + (n > 1 ? ' personnes' : ' personne') : '') + ' à la Brasserie Phoenix (' + adr + '). Merci de répondre OUI pour confirmer, ou de nous prévenir si vous ne pouvez pas venir. À bientôt !';
    if (lang === 'es') return 'Hola' + (nom ? ' ' + nom : '') + ', le esperamos ' + (demain ? 'mañana, ' : 'el ') + quand + ' a las ' + h + (n ? ' para ' + n + (n > 1 ? ' personas' : ' persona') : '') + ' en la Brasserie Phoenix (' + adr + '). Por favor, responda SÍ para confirmar o avísenos si no puede venir. ¡Hasta pronto!';
    if (lang === 'nl') return 'Hallo' + (nom ? ' ' + nom : '') + ', we verwachten u ' + (demain ? 'morgen, ' : 'op ') + quand + ' om ' + h + (n ? ' met ' + n + (n > 1 ? ' personen' : ' persoon') : '') + ' in Brasserie Phoenix (' + adr + '). Antwoord JA om te bevestigen, of laat het ons weten als u niet kunt komen. Tot snel!';
    return 'Hello' + (nom ? ' ' + nom : '') + ', we look forward to seeing you ' + (demain ? 'tomorrow, ' : 'on ') + quand + ' at ' + h + (n ? ' for ' + n + (n > 1 ? ' people' : ' person') : '') + ' at Brasserie Phoenix (' + adr + '). Please reply YES to confirm, or let us know if you cannot come. See you soon!';
  }
  var SUJET = { fr: 'Votre réservation à la Brasserie Phoenix', es: 'Su reserva en la Brasserie Phoenix', en: 'Your booking at Brasserie Phoenix', nl: 'Uw reservering bij Brasserie Phoenix' };

  function lien(r, lang, auj) {
    var txt = message(r, lang, auj);
    if (r.contact.type === 'wa') return 'https://wa.me/' + r.contact.valeur + '?text=' + encodeURIComponent(txt);
    if (r.contact.type === 'email') return 'mailto:' + r.contact.valeur + '?subject=' + encodeURIComponent(SUJET[lang] || SUJET.en) + '&body=' + encodeURIComponent(txt);
    return '';
  }

  /* Ce qu'il faut rappeler aujourd'hui. */
  function aRappeler(lignes, auj) {
    var p = preparer(lignes), cibles = joursCibles(auj);
    var liste = p.reservations.filter(function (r) { return cibles.indexOf(r.date) >= 0; })
      .sort(function (a, b) { return (a.date + a.heure).localeCompare(b.date + b.heure); });
    return { auj: auj, cibles: cibles, liste: liste, ignorees: p.ignorees, total: p.reservations.length };
  }

  var API = { aujourdhui: aujourdhui, joursCibles: joursCibles, ajouterJours: ajouterJours, jourSemaine: jourSemaine,
    lireContact: lireContact, langue: langue, preparer: preparer, message: message, lien: lien, aRappeler: aRappeler,
    normNom: normNom, LANGS: LANGS, JOURS: JOURS, dateValide: dateValide };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else racine.Rappel = API;
})(this);
