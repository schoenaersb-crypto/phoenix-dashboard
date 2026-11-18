# Labo — Verifactu : empreinte chaînée + QR (prototype)

Isolé dans `labo/`, branché sur rien. À reprendre dans le chantier c4e8a1d326 (« Faire une facture client depuis la caisse »).

- `verifactu.js` : empreinte SHA-256 d'un RegistroAlta au format AEAT, chaînage, adresse du QR de vérification (production / préproduction), chaîne unique sérialisée (un seul compteur), vérification d'une chaîne.
- `index.html` : démo téléphone (articles et montants factices, NIF de test AEAT 89890001K, QR vers la préproduction AEAT).
- Tests : `node labo/verifactu/test-verifactu.js` (29) · `python3 labo/verifactu/e2e-verifactu.py` (22).

Hors prototype : envoi à l'AEAT (certificat) ou, sans envoi, signature XAdES + journal d'événements ; déclaration responsable du logiciel ; décision avec Nati.
