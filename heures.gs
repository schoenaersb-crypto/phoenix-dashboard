/* ═══════════════════════════════════════════════════════════════════
   PHOENIX — LES HEURES, EN DÉTAIL
   À coller à la fin de Code.gs, puis ajouter UNE ligne dans le
   routeur (voir tout en bas de ce fichier).

   Ce que ça change : jusqu'ici le dashboard ne recevait qu'un total
   par personne. Impossible d'analyser quoi que ce soit avec ça. Cette
   fonction renvoie les SÉANCES : qui, quel jour, entré à quelle
   heure, sorti à quelle heure, sur quel service.

   Elle lit la feuille Pointage en repérant les colonnes par leur
   nom, pas par leur position — comme ça, si un jour une colonne est
   ajoutée ou déplacée, rien ne casse.
   ═══════════════════════════════════════════════════════════════════ */

/* La journée de service bascule à 5 h du matin : un service qui finit
   à 2 h appartient à la veille. Sans ça, chaque soirée est coupée en
   deux et tous les totaux sont faux. */
function phxJourService_(d) {
  var t = new Date(d.getTime());
  if (t.getHours() < 5) t.setDate(t.getDate() - 1);
  return Utilities.formatDate(t, 'Europe/Madrid', 'yyyy-MM-dd');
}

function phxNormalise_(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/* Retrouve l'index d'une colonne à partir de plusieurs noms possibles. */
function phxColonne_(entetes, noms) {
  for (var i = 0; i < entetes.length; i++) {
    var h = phxNormalise_(entetes[i]);
    for (var j = 0; j < noms.length; j++) {
      if (h === noms[j] || h.indexOf(noms[j]) === 0) return i;
    }
  }
  return -1;
}

function phxHeure_(d) {
  return Utilities.formatDate(d, 'Europe/Madrid', 'HH:mm');
}

/**
 * Renvoie les séances de travail sur une période.
 * @param {Object} p  { depuis:'yyyy-MM-dd', jusqu:'yyyy-MM-dd' }
 */
function caisseHeures(p) {
  p = p || {};
  var ss = SpreadsheetApp.openById(CLASSEUR_ID);
  var f = ss.getSheetByName('Pointage');
  if (!f) return { ok: false, erreur: 'feuille Pointage introuvable' };

  var val = f.getDataRange().getValues();
  if (val.length < 2) return { ok: true, seances: [], anomalies: [], profils: [] };

  var e = val[0];
  var cTs = phxColonne_(e, ['horodatage', 'timestamp', 'ts', 'datetime', 'dateheure', 'date']);
  var cQui = phxColonne_(e, ['prenom', 'nom', 'qui', 'employe', 'profil']);
  var cSens = phxColonne_(e, ['sens', 'type', 'action', 'mouvement', 'etat']);
  var cPoste = phxColonne_(e, ['poste', 'appareil', 'source']);
  if (cTs < 0 || cQui < 0 || cSens < 0) {
    return { ok: false, erreur: 'colonnes non reconnues', entetes: e };
  }

  /* On ramasse tout, on triera après : les lignes peuvent arriver
     dans le désordre si deux appareils ont écrit en même temps. */
  var lignes = [];
  for (var i = 1; i < val.length; i++) {
    var brut = val[i][cTs];
    if (!brut) continue;
    var d = (brut instanceof Date) ? brut : new Date(brut);
    if (isNaN(d.getTime())) continue;
    var qui = String(val[i][cQui] || '').trim();
    if (!qui) continue;
    var sens = phxNormalise_(val[i][cSens]);
    sens = (sens.indexOf('sort') === 0 || sens.indexOf('out') === 0 || sens.indexOf('fin') === 0)
      ? 'sortie' : 'entree';
    lignes.push({ t: d.getTime(), d: d, qui: qui, sens: sens,
                  poste: cPoste >= 0 ? String(val[i][cPoste] || '') : '' });
  }
  lignes.sort(function (a, b) { return a.t - b.t; });

  /* Appariement entrée → sortie, personne par personne. */
  var ouvert = {}, seances = [], anomalies = [];
  var MAX = 13 * 3600 * 1000;   /* au-delà, c'est une sortie oubliée */

  function ferme(o, finT, motif) {
    var minutes = Math.round((finT - o.t) / 60000);
    var jour = phxJourService_(o.d);
    var hDeb = o.d.getHours();
    var service = (hDeb < 17) ? 'midi' : 'soir';
    var fin = new Date(finT);
    if (hDeb < 17 && (fin.getHours() >= 19 || minutes > 420)) service = 'journee';
    seances.push({
      nom: o.qui, jour: jour, debut: phxHeure_(o.d), fin: phxHeure_(fin),
      minutes: minutes, service: service, poste: o.poste,
      tsDebut: o.t, tsFin: finT, incomplet: !!motif
    });
    if (motif) anomalies.push({ nom: o.qui, jour: jour, type: motif,
      detail: 'entrée à ' + phxHeure_(o.d) + (motif === 'sortie_oubliee'
        ? ', pas de sortie enregistrée' : '') });
  }

  for (var k = 0; k < lignes.length; k++) {
    var l = lignes[k];
    var o = ouvert[l.qui];
    if (l.sens === 'entree') {
      if (o) {
        /* Deux entrées de suite : la première n'a jamais été fermée. */
        ferme(o, Math.min(l.t, o.t + MAX), 'sortie_oubliee');
      }
      ouvert[l.qui] = l;
    } else {
      if (!o) {
        anomalies.push({ nom: l.qui, jour: phxJourService_(l.d), type: 'sortie_seule',
          detail: 'sortie à ' + phxHeure_(l.d) + ' sans entrée' });
        continue;
      }
      if (l.t - o.t > MAX) ferme(o, o.t + MAX, 'sortie_oubliee');
      else ferme(o, l.t, null);
      delete ouvert[l.qui];
    }
  }
  /* Ce qui reste ouvert : soit quelqu'un est en poste maintenant, soit
     il a oublié de pointer sa sortie. On distingue les deux. */
  var maintenant = Date.now();
  for (var q in ouvert) {
    var oo = ouvert[q];
    if (maintenant - oo.t < MAX) {
      seances.push({ nom: oo.qui, jour: phxJourService_(oo.d), debut: phxHeure_(oo.d),
        fin: null, minutes: Math.round((maintenant - oo.t) / 60000),
        service: (oo.d.getHours() < 17 ? 'midi' : 'soir'), poste: oo.poste,
        tsDebut: oo.t, tsFin: null, enCours: true, incomplet: false });
    } else {
      ferme(oo, oo.t + MAX, 'sortie_oubliee');
    }
  }

  /* Filtrage sur la période demandée, une fois les séances construites :
     une soirée du 3 août qui finit le 4 à 1 h reste au 3 août. */
  if (p.depuis) seances = seances.filter(function (s) { return s.jour >= p.depuis; });
  if (p.jusqu) seances = seances.filter(function (s) { return s.jour <= p.jusqu; });
  var dep = p.depuis || '0000', jus = p.jusqu || '9999';
  anomalies = anomalies.filter(function (a) { return a.jour >= dep && a.jour <= jus; });

  seances.sort(function (a, b) { return a.tsDebut - b.tsDebut; });

  var noms = {};
  seances.forEach(function (s) { noms[s.nom] = 1; });

  return {
    ok: true, depuis: p.depuis || null, jusqu: p.jusqu || null,
    seances: seances, anomalies: anomalies, profils: Object.keys(noms).sort(),
    genere: new Date().toISOString()
  };
}
