/* node labo/rappel-resa/test-rappel.js */
var R = require('./rappel.js'), vm = require('vm'), fs = require('fs');
var n = 0, ko = 0;
function ok(c, m){ n++; if(!c){ ko++; console.log('ÉCHEC', m); } }
var ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(__dirname + '/donnees-exemple.js', 'utf8'), ctx);
var EX = ctx.window.RESA_EXEMPLE;

// Jours cibles
ok(JSON.stringify(R.joursCibles('2026-11-27')) === '["2026-11-28"]', 'vendredi -> samedi');
ok(JSON.stringify(R.joursCibles('2026-12-01')) === '["2026-12-03"]', 'mardi -> jeudi (mercredi fermé)');
ok(R.joursCibles('2026-12-02').length === 0, 'mercredi -> rien');
ok(JSON.stringify(R.joursCibles('2026-12-31')) === '["2027-01-01"]', 'passage d\'année');
ok(JSON.stringify(R.joursCibles('2026-03-28')) === '["2026-03-29"]', 'changement d\'heure');
// Fuseau Madrid
ok(R.aujourdhui(new Date('2026-11-27T23:30:00Z')) === '2026-11-28', '00:30 à Madrid = lendemain');
ok(R.aujourdhui(new Date('2026-07-01T21:59:00Z')) === '2026-07-01', '23:59 Madrid été');
// Contacts
ok(R.lireContact('#ERROR!').type === 'aucun', '#ERROR!');
ok(R.lireContact('').type === 'aucun', 'vide');
ok(R.lireContact('brasseriephoenixrestaurant@gmail.com').type === 'aucun', 'notre adresse');
ok(R.lireContact('BrasseriePhoenixRestaurant@gmail.com').type === 'aucun', 'notre adresse majuscules');
ok(R.lireContact('34744622975').type === 'aucun', 'notre numéro');
ok(R.lireContact('+32 477 28 77 69').valeur === '32477287769', 'format +32 avec espaces');
ok(R.lireContact('0032477287769').valeur === '32477287769', 'format 0032');
ok(R.lireContact('612345678').valeur === '34612345678', 'mobile espagnol sans indicatif');
ok(R.lireContact('475921707').type === 'incomplet', 'belge sans indicatif = incomplet (pas deviné)');
ok(R.lireContact('0475921707').type === 'incomplet', '04xx = incomplet');
ok(R.lireContact('a@b.co').type === 'email', 'email');
ok(R.lireContact('a@b').type === 'aucun', 'email illisible');
ok(R.lireContact(32477287769).valeur === '32477287769', 'nombre (Sheets)');
// Préparation sur la copie anonymisée
var p = R.preparer(EX);
var sam = p.reservations.filter(function(r){ return r.date === '2026-11-28'; });
ok(sam.length === 8, 'samedi : 8 réservations uniques (' + sam.length + ')');
var b = sam.filter(function(r){ return /durand/i.test(r.nom); });
ok(b.length === 1 && b[0].contact.type === 'wa' && b[0].lignes.length === 3, 'triplon fusionné, meilleur contact gardé');
var m = sam.filter(function(r){ return /martin/i.test(r.nom); });
ok(m.length === 1 && m[0].contact.valeur === '32470000003' && m[0].confirmee, '« Martin Claude » = « Claude Martin », #ERROR! écarté');
var f = sam.filter(function(r){ return r.heure === '20:30'; });
ok(f.length === 1 && f[0].nom === 'Client F', 'ligne « Client » rattachée');
ok(p.ignorees.some(function(x){ return /annul/.test(x.motif); }), 'annulée ignorée');
ok(p.ignorees.some(function(x){ return /date/.test(x.motif); }), '2026-30-07 ignorée');
ok(sam.filter(function(r){ return r.nom === 'Client A'; })[0].langue === 'nl', 'note néerlandaise -> NL');
ok(sam.filter(function(r){ return r.nom === 'May'; })[0].langue === 'fr', 'note française -> FR');
ok(sam.filter(function(r){ return r.nom === 'Client F'; })[0].langue === 'es', '+34 -> ES');
ok(sam.filter(function(r){ return r.nom === 'Client A'; })[0].confirmee === false, 'à valider');
var j = p.reservations.filter(function(r){ return r.nom === 'Client J'; })[0];
ok(j && j.confirmee && j.contact.type === 'aucun' && j.langue === 'nl', 'Client J : 2 lignes, pas de contact, NL');
// Messages
var r = { date: '2026-11-28', heure: '20:30', nom: 'Ana', couverts: 3, contact: { type: 'wa', valeur: '34600000006' } };
var M = { fr: R.message(r,'fr','2026-11-27'), es: R.message(r,'es','2026-11-27'), en: R.message(r,'en','2026-11-27'), nl: R.message(r,'nl','2026-11-27') };
ok(/demain, samedi 28 novembre à 20:30 pour 3 personnes/.test(M.fr), 'FR ' + M.fr);
ok(/mañana, sábado 28 de noviembre a las 20:30 para 3 personas/.test(M.es), 'ES ' + M.es);
ok(/tomorrow, Saturday 28 November at 20:30 for 3 people/.test(M.en), 'EN ' + M.en);
ok(/morgen, zaterdag 28 november om 20:30 met 3 personen/.test(M.nl), 'NL ' + M.nl);
ok(/jeudi 3 décembre/.test(R.message({ date:'2026-12-03', heure:'19:30', nom:'', couverts:1, contact:{} }, 'fr', '2026-12-01')) && !/demain/.test(R.message({ date:'2026-12-03', heure:'19:30', nom:'', couverts:1, contact:{} }, 'fr', '2026-12-01')), 'mardi pour jeudi : pas « demain »');
ok(/1 personne\b/.test(R.message({ date:'2026-12-03', heure:'19:30', nom:'', couverts:1, contact:{} }, 'fr')), 'singulier');
ok(/^Bonjour, /.test(R.message({ date:'2026-12-03', heure:'19:30', nom:'Client', couverts:2, contact:{} }, 'fr')), 'nom générique non repris');
Object.keys(M).forEach(function(l){ ok(/Brasserie Phoenix/.test(M[l]) && /Desiderio Rodríguez 37/.test(M[l]) && !/3CM1|semi/i.test(M[l]), 'marque ' + l); });
// Liens
var L = R.lien(r, 'es', '2026-11-27');
ok(L.indexOf('https://wa.me/34600000006?text=') === 0, 'lien wa.me');
ok(decodeURIComponent(L.split('text=')[1]) === M.es, 'texte encodé = message');
var r2 = { date:'2026-11-28', heure:'12:00', nom:"O'Neil & Co #1 ?", couverts:2, contact:{ type:'wa', valeur:'447000000000' } };
ok(decodeURIComponent(R.lien(r2,'en','2026-11-27').split('text=')[1]).indexOf("O'Neil & Co #1 ?") > 0, 'caractères & # ? encodés');
var e = R.lien({ date:'2026-11-28', heure:'21:00', nom:'G', couverts:4, contact:{ type:'email', valeur:'g@example.com' } }, 'nl', '2026-11-27');
ok(/^mailto:g@example\.com\?subject=Uw%20reservering/.test(e), 'mailto NL');
ok(R.lien({ date:'2026-11-28', heure:'21:00', nom:'G', couverts:4, contact:{ type:'aucun' } }, 'fr') === '', 'pas de lien sans contact');
// aRappeler
var a = R.aRappeler(EX, '2026-11-27');
ok(a.liste.length === 8 && a.liste[0].heure === '12:00', 'liste triée par heure');
ok(R.aRappeler(EX, '2026-12-02').liste.length === 0, 'mercredi : rien');
ok(R.aRappeler(EX, '2026-12-01').liste.length === 1 && R.aRappeler(EX, '2026-12-01').liste[0].nom === 'Client K', 'mardi : jeudi');
ok(R.aRappeler([], '2026-11-27').liste.length === 0, 'onglet vide');
ok(R.aRappeler([["Date","Heure"]], '2026-11-27').liste.length === 0, 'en-tête seul');
ok(R.aRappeler([{ date:'2026-11-28', heure:'20:00', couverts:'2', nom:'Obj', contact:'34600000001', statut:'Confirmée' }], '2026-11-27').liste.length === 1, 'objets acceptés');
// Volume : 2000 lignes
var gros = [EX[0]]; for (var i = 0; i < 2000; i++) gros.push(['2026-11-28', (10 + i % 12) + ':00', '2', 'Nom ' + i, '3460000' + ('0000' + i).slice(-4), 'Email', 'Confirmée', '']);
var t0 = Date.now(); var g = R.aRappeler(gros, '2026-11-27'); var dt = Date.now() - t0;
ok(g.liste.length === 2000 && dt < 500, '2000 lignes en ' + dt + ' ms');
console.log((n - ko) + '/' + n + ' vérifications OK');
process.exit(ko ? 1 : 0);
