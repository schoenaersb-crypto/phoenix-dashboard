/* ════════════════════════════════════════════════════════════════════
   Labo — brique Verifactu (prototype, NE PAS brancher sur la caisse)
   ────────────────────────────────────────────────────────────────────
   Ce que fait ce fichier :
   1. l'empreinte (« huella ») SHA-256 d'un registre de facturation
      d'émission (RegistroAlta), chaînée avec l'empreinte du registre
      précédent, au format de la spécification AEAT ;
   2. l'adresse du QR de vérification que le client scanne ;
   3. une chaîne unique (un seul compteur, une seule dernière empreinte)
      et la vérification d'une chaîne existante.
   Ce qu'il NE fait PAS : l'envoi des registres à l'AEAT (certificat
   électronique), le XML, la déclaration responsable du logiciel.
   Utilisable dans la page (navigateur) et dans node (tests).
   ════════════════════════════════════════════════════════════════════ */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Verifactu = fabrique();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var QR_PROD = 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR';
  var QR_PRE  = 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR';

  /* montants : toujours 2 décimales, point décimal (même valeur dans le
     registre envoyé et dans le calcul de l'empreinte) */
  function montant(x) {
    if (x === '' || x == null) throw new Error('Montant manquant');
    var n = Number(x);
    if (!isFinite(n)) throw new Error('Montant invalide : ' + x);
    return (Math.round((n + Math.sign(n) * 1e-9) * 100) / 100).toFixed(2);
  }
  /* date d'expédition : JJ-MM-AAAA */
  function dateJMA(d) {
    var j, m, a;
    if (typeof d === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(d)) { j = +d.slice(0, 2); m = +d.slice(3, 5); a = +d.slice(6); }
    else if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) { a = +d.slice(0, 4); m = +d.slice(5, 7); j = +d.slice(8); }
    else throw new Error('Date attendue JJ-MM-AAAA ou AAAA-MM-JJ : ' + d);
    var t = new Date(Date.UTC(a, m - 1, j));
    if (t.getUTCFullYear() !== a || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== j) throw new Error('Date impossible : ' + d);
    return String(j).padStart(2, '0') + '-' + String(m).padStart(2, '0') + '-' + a;
  }
  /* horodatage avec fuseau de Madrid : 2026-11-17T21:04:09+01:00 */
  function horodatage(date) {
    date = date || new Date();
    var f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    var o = {}; f.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
    if (o.hour === '24') o.hour = '00';
    var local = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second);
    var dec = Math.round((local - Math.floor(date.getTime() / 1000) * 1000) / 60000);
    var s = dec >= 0 ? '+' : '-', a = Math.abs(dec);
    return o.year + '-' + o.month + '-' + o.day + 'T' + o.hour + ':' + o.minute + ':' + o.second +
      s + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0');
  }
  function propre(v) { return String(v == null ? '' : v).trim(); }

  /* chaîne d'entrée de l'empreinte d'un RegistroAlta (ordre imposé) */
  function chaineAlta(r) {
    return 'IDEmisorFactura=' + propre(r.nif) +
      '&NumSerieFactura=' + propre(r.numSerie) +
      '&FechaExpedicionFactura=' + dateJMA(r.fecha) +
      '&TipoFactura=' + (propre(r.tipo) || 'F2') +
      '&CuotaTotal=' + montant(r.cuota) +
      '&ImporteTotal=' + montant(r.importe) +
      '&Huella=' + propre(r.huellaAnterior) +
      '&FechaHoraHusoGenRegistro=' + propre(r.horodatage);
  }

  function hexMaj(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
    return s.toUpperCase();
  }
  /* SHA-256 : WebCrypto (navigateur, https) ou crypto (node). Promesse. */
  function sha256(txt) {
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined')
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)).then(hexMaj);
    if (typeof require === 'function') {
      var c = require('crypto');
      return Promise.resolve(c.createHash('sha256').update(txt, 'utf8').digest('hex').toUpperCase());
    }
    /* navigateur en http (hors localhost) : WebCrypto absent */
    return Promise.reject(new Error('Empreinte impossible : la page doit être ouverte en https'));
  }
  function empreinte(r) { return sha256(chaineAlta(r)); }

  /* adresse du QR de vérification */
  function urlQR(r, pre) {
    return (pre ? QR_PRE : QR_PROD) +
      '?nif=' + encodeURIComponent(propre(r.nif)) +
      '&numserie=' + encodeURIComponent(propre(r.numSerie)) +
      '&fecha=' + encodeURIComponent(dateJMA(r.fecha)) +
      '&importe=' + encodeURIComponent(montant(r.importe));
  }

  /* Une chaîne = UN compteur et UNE dernière empreinte. Elle doit vivre
     à un seul endroit (le relais ou le backend), jamais sur chaque
     tablette : deux tablettes = deux chaînes = numéros en double. */
  function Chaine(nif, serie, etat) {
    etat = etat || {};
    this.nif = nif; this.serie = serie;
    this.compteur = etat.compteur || 0;
    this.derniere = etat.derniere || '';
    this.registres = etat.registres || [];
    this.preproduction = !!etat.preproduction;
    this._file = Promise.resolve();
  }
  /* emettre() est mis en file : deux appels simultanés ne lisent jamais
     la même « dernière empreinte » */
  Chaine.prototype.emettre = function (v) {
    var self = this;
    var p = this._file.then(function () {
      var maintenant = new Date(), hd = v.horodatage || horodatage(maintenant);
      var r = { nif: self.nif, numSerie: self.serie + '-' + String(self.compteur + 1).padStart(6, '0'),
        fecha: dateJMA(v.fecha || hd.slice(0, 10)), tipo: propre(v.tipo) || 'F2',
        cuota: montant(v.cuota), importe: montant(v.importe),
        huellaAnterior: self.derniere, horodatage: hd };
      chaineAlta(r);               /* tout est validé AVANT de prendre un numéro */
      return empreinte(r).then(function (h) {
        self.compteur++;           /* le numéro n'est consommé qu'une fois l'empreinte faite */
        r.huella = h; self.derniere = h; self.registres.push(r);
        r.qr = urlQR(r, self.preproduction); return r;
      });
    });
    this._file = p.catch(function () {});
    return p;
  };

  /* vérifie une suite de registres : empreintes et chaînage */
  function verifier(registres) {
    var prec = '', i = 0;
    function suite() {
      if (i >= registres.length) return Promise.resolve({ ok: true, n: registres.length });
      var r = registres[i];
      if (propre(r.huellaAnterior) !== prec) return Promise.resolve({ ok: false, n: i, raison: 'chaînage rompu au registre ' + (i + 1) });
      return empreinte(r).then(function (h) {
        if (h !== r.huella) return { ok: false, n: i, raison: 'empreinte fausse au registre ' + (i + 1) };
        prec = r.huella; i++; return suite();
      });
    }
    return suite();
  }

  return { chaineAlta: chaineAlta, empreinte: empreinte, urlQR: urlQR, Chaine: Chaine,
    verifier: verifier, horodatage: horodatage, montant: montant, dateJMA: dateJMA,
    QR_PROD: QR_PROD, QR_PRE: QR_PRE };
}));
