/* Labo — réservation par WhatsApp avec message pré-rempli (prototype)
   Le client choisit date, service, heure, nombre et nom ; WhatsApp s'ouvre
   avec un message complet dans sa langue. Rien n'est envoyé sans qu'il
   appuie lui-même sur « Envoyer » dans WhatsApp. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.ResaWA = fabrique();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var NUMERO = '34744622975';               /* +34 744 62 29 75 (site public) */
  var JOUR_FERME = 3;                       /* mercredi */
  /* créneaux repris de reserver.html */
  var SLOTS = { midi: ['12:30','13:00','13:30','14:00','14:30','15:00'],
                soir: ['19:30','20:00','20:30','21:00','21:30','22:00'] };
  var T = {
    fr: { bonjour: 'Bonjour, je souhaite réserver une table à la Brasserie Phoenix.', date: 'Date', heure: 'Heure',
          pers: 'Personnes', nom: 'Nom', note: 'Remarque', merci: 'Merci !', midi: 'midi', soir: 'soir',
          jours: ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'] },
    es: { bonjour: 'Hola, quisiera reservar una mesa en Brasserie Phoenix.', date: 'Fecha', heure: 'Hora',
          pers: 'Personas', nom: 'Nombre', note: 'Nota', merci: '¡Gracias!', midi: 'comida', soir: 'cena',
          jours: ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'] },
    en: { bonjour: 'Hello, I would like to book a table at Brasserie Phoenix.', date: 'Date', heure: 'Time',
          pers: 'Guests', nom: 'Name', note: 'Note', merci: 'Thank you!', midi: 'lunch', soir: 'dinner',
          jours: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'] },
    nl: { bonjour: 'Hallo, ik wil graag een tafel reserveren bij Brasserie Phoenix.', date: 'Datum', heure: 'Tijd',
          pers: 'Personen', nom: 'Naam', note: 'Opmerking', merci: 'Dank u wel!', midi: 'lunch', soir: 'diner',
          jours: ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'] }
  };
  function jourSemaine(iso) { var p = iso.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); }
  function estFerme(iso) { return jourSemaine(iso) === JOUR_FERME; }
  /* coupe par caractère (jamais au milieu d'un emoji, sinon encodeURIComponent plante) */
  function propre(s, max) { return Array.from(String(s == null ? '' : s).replace(/[\u0000-\u001f]+/g, ' ').trim()).slice(0, max || 80).join('').trim(); }
  /* date et heure de Madrid, quel que soit le pays du téléphone */
  function maintenantMadrid(date) {
    var f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    var o = {}; f.formatToParts(date || new Date()).forEach(function (p) { o[p.type] = p.value; });
    return { jour: o.year + '-' + o.month + '-' + o.day, heure: (o.hour === '24' ? '00' : o.hour) + ':' + o.minute };
  }
  /* contrôle : renvoie un code d'erreur ou '' */
  /* maintenantHHMM (facultatif) : refuse une heure déjà passée aujourd'hui */
  function verifier(d, aujourdhuiIso, maintenantHHMM) {
    if (!d.date || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return 'date';
    if (aujourdhuiIso && d.date < aujourdhuiIso) return 'passe';
    if (estFerme(d.date)) return 'ferme';
    if (!SLOTS[d.service] || SLOTS[d.service].indexOf(d.heure) < 0) return 'heure';
    if (aujourdhuiIso && maintenantHHMM && d.date === aujourdhuiIso && d.heure <= maintenantHHMM) return 'tard';
    /* 1 à 30 : même limite que reserver.html */
    var n = +d.personnes; if (!(n >= 1 && n <= 30) || n !== Math.floor(n)) return 'personnes';
    if (!propre(d.nom)) return 'nom';
    return '';
  }
  function message(lang, d) {
    var t = T[lang] || T.fr, p = d.date.split('-');
    var L = [t.bonjour,
      t.date + ' : ' + t.jours[jourSemaine(d.date)] + ' ' + p[2] + '/' + p[1] + '/' + p[0] + ' (' + t[d.service] + ')',
      t.heure + ' : ' + d.heure,
      t.pers + ' : ' + (+d.personnes),
      t.nom + ' : ' + propre(d.nom)];
    var note = propre(d.note, 200); if (note) L.push(t.note + ' : ' + note);
    L.push(t.merci);
    return L.join('\n');
  }
  function lien(lang, d) { return 'https://wa.me/' + NUMERO + '?text=' + encodeURIComponent(message(lang, d)); }
  return { maintenantMadrid: maintenantMadrid, NUMERO: NUMERO, SLOTS: SLOTS, T: T, estFerme: estFerme, verifier: verifier, message: message, lien: lien, jourSemaine: jourSemaine };
}));
