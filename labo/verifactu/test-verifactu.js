/* node labo/verifactu/test-verifactu.js */
'use strict';
var V = require('./verifactu.js');
var ok = 0, ko = 0;
function vrai(c, m) { if (c) { ok++; } else { ko++; console.log('ÉCHEC : ' + m); } }

(async function () {
  /* 1. vecteur de référence AEAT (spécification « huella o hash », §6, 1er registre) */
  var aeat = { nif: '89890001K', numSerie: '12345678/G33', fecha: '01-01-2024', tipo: 'F1',
    cuota: 12.35, importe: 123.45, huellaAnterior: '', horodatage: '2024-01-01T19:20:30+01:00' };
  vrai(V.chaineAlta(aeat) === 'IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00', 'chaîne AEAT');
  vrai(await V.empreinte(aeat) === '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60', 'empreinte AEAT');

  /* 2. normalisations */
  vrai(V.montant(10) === '10.00' && V.montant('7.5') === '7.50' && V.montant(0.1 + 0.2) === '0.30', 'montants 2 décimales');
  vrai(V.dateJMA('2026-11-17') === '17-11-2026', 'date AAAA-MM-JJ → JJ-MM-AAAA');
  var e = false; try { V.montant('abc'); } catch (x) { e = true; } vrai(e, 'montant invalide refusé');
  e = false; try { V.dateJMA('17/11/2026'); } catch (x) { e = true; } vrai(e, 'date invalide refusée');
  var esp = Object.assign({}, aeat, { nif: ' 89890001K ' });
  vrai(await V.empreinte(esp) === await V.empreinte(aeat), 'espaces autour ignorés');

  /* 3. horodatage Madrid : hiver +01:00, été +02:00, changement d'heure */
  vrai(V.horodatage(new Date('2026-11-17T20:04:09Z')) === '2026-11-17T21:04:09+01:00', 'hiver');
  vrai(V.horodatage(new Date('2026-07-01T10:00:00Z')) === '2026-07-01T12:00:00+02:00', 'été');
  vrai(V.horodatage(new Date('2026-10-25T00:59:59Z')) === '2026-10-25T02:59:59+02:00', 'avant retour à l\'heure d\'hiver');
  vrai(V.horodatage(new Date('2026-10-25T01:00:00Z')) === '2026-10-25T02:00:00+01:00', 'après retour à l\'heure d\'hiver');
  vrai(V.horodatage(new Date('2026-11-17T23:30:00Z')) === '2026-11-18T00:30:00+01:00', 'minuit passé');

  /* 4. QR : adresse officielle, / et espaces encodés */
  var qr = V.urlQR({ nif: 'B70762422', numSerie: 'T 2026/000001', fecha: '2026-11-17', importe: 48.5 });
  vrai(qr === 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=B70762422&numserie=T%202026%2F000001&fecha=17-11-2026&importe=48.50', 'adresse QR');

  /* 5. une chaîne de 50 tickets (montants factices) se vérifie */
  var ch = new V.Chaine('B70762422', 'LABO2026');
  for (var i = 1; i <= 50; i++) await ch.emettre({ fecha: '2026-11-17', cuota: i * 0.91, importe: i * 10, horodatage: V.horodatage(new Date(Date.UTC(2026, 10, 17, 12, 0, i))) });
  var r = await V.verifier(ch.registres);
  vrai(r.ok && r.n === 50, 'chaîne de 50 vérifiée');
  vrai(ch.registres[0].huellaAnterior === '' && ch.registres[1].huellaAnterior === ch.registres[0].huella, 'chaînage');

  /* 6. falsification détectée : montant modifié, ticket supprimé, ordre inversé */
  var f1 = ch.registres.map(function (x) { return Object.assign({}, x); }); f1[20].importe = 1;
  vrai(!(await V.verifier(f1)).ok, 'montant modifié détecté');
  var f2 = ch.registres.slice(); f2.splice(10, 1);
  vrai(!(await V.verifier(f2)).ok, 'ticket supprimé détecté');
  var f3 = ch.registres.slice(); var t = f3[5]; f3[5] = f3[6]; f3[6] = t;
  vrai(!(await V.verifier(f3)).ok, 'ordre inversé détecté');

  /* 7. deux encaissements au même instant sur la même chaîne : numéros uniques, chaîne valide */
  var c2 = new V.Chaine('B70762422', 'LABO2026');
  var lots = []; for (var k = 0; k < 20; k++) lots.push(c2.emettre({ fecha: '2026-11-17', cuota: 1, importe: 11 }));
  var res = await Promise.all(lots);
  var nums = new Set(res.map(function (x) { return x.numSerie; }));
  vrai(nums.size === 20, '20 envois simultanés = 20 numéros différents');
  vrai((await V.verifier(c2.registres)).ok, 'envois simultanés : chaîne valide');

  /* 8. DEUX TABLETTES avec chacune sa chaîne (comme le compteur numTicket de la caisse aujourd'hui) */
  var tabA = new V.Chaine('B70762422', 'LABO2026'), tabB = new V.Chaine('B70762422', 'LABO2026');
  var a = await tabA.emettre({ fecha: '2026-11-17', cuota: 2, importe: 22 });
  var b = await tabB.emettre({ fecha: '2026-11-17', cuota: 3, importe: 33 });
  vrai(a.numSerie === b.numSerie, 'démonstration : 2 tablettes indépendantes = même numéro en double');
  vrai(!(await V.verifier([a, b])).ok, 'démonstration : 2 tablettes = chaîne rompue');

  /* 9. reprise après coupure : la chaîne repart de l'état sauvegardé */
  var sauve = JSON.parse(JSON.stringify({ compteur: ch.compteur, derniere: ch.derniere, registres: ch.registres }));
  var reprise = new V.Chaine('B70762422', 'LABO2026', sauve);
  await reprise.emettre({ fecha: '2026-11-17', cuota: 5, importe: 55 });
  vrai((await V.verifier(reprise.registres)).ok && reprise.registres.length === 51, 'reprise après coupure');

  /* 9b. une erreur ne consomme pas de numéro ; dates impossibles refusées */
  var c4 = new V.Chaine('B70762422', 'T');
  await c4.emettre({ fecha: '2026-11-17', cuota: 1, importe: 10 });
  var refus = false; try { await c4.emettre({ fecha: '2026-11-17', cuota: 1, importe: 'abc' }); } catch (x) { refus = true; }
  var apres = await c4.emettre({ fecha: '2026-11-17', cuota: 1, importe: 10 });
  vrai(refus && apres.numSerie === 'T-000002' && c4.registres.length === 2, 'erreur sans trou de numérotation (' + apres.numSerie + ')');
  e = false; try { V.dateJMA('31-02-2026'); } catch (x) { e = true; } vrai(e, '31-02 refusé');
  e = false; try { V.montant(''); } catch (x) { e = true; } vrai(e, 'montant vide refusé');
  vrai(V.montant(1.005) === '1.01', 'arrondi 1.005 → 1.01');
  var pre = new V.Chaine('89890001K', 'LABO', { preproduction: true });
  vrai((await pre.emettre({ fecha: '2026-11-17', cuota: 1, importe: 10 })).qr.indexOf(V.QR_PRE) === 0, 'mode essai : QR de préproduction');

  /* 10. temps de calcul */
  var t0 = Date.now(), c3 = new V.Chaine('B70762422', 'X');
  for (var m = 0; m < 1000; m++) await c3.emettre({ fecha: '2026-11-17', cuota: 1, importe: 10 });
  var ms = Date.now() - t0;
  vrai(ms < 3000, '1000 tickets en moins de 3 s (' + ms + ' ms)');
  console.log('Temps : 1000 tickets chaînés en ' + ms + ' ms');

  console.log(ok + ' vérifications Verifactu passées' + (ko ? ', ' + ko + ' ÉCHECS' : '') + '.');
  process.exit(ko ? 1 : 0);
})();
