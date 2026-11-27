# Labo — Rappels de réservation en un appui (prototype, 27/11/2026)

**Idée** : la veille, envoyer à chaque client qui a réservé un rappel « répondez OUI pour confirmer », pour réduire les tables vides (no-shows) — technique décrite par letsbot.net (2 août 2026, Zapier + API WhatsApp payante). Ici, **sans API ni abonnement** : la page prépare le message, la personne de l'équipe appuie, WhatsApp (ou l'e-mail) s'ouvre avec le texte prêt, elle appuie sur Envoyer. Rien ne part tout seul.

- `rappel.js` : lit les lignes de l'onglet **Reservations** (en-tête `Date, Heure, Couverts, Nom, Contact, Statut, Note`), enlève les doublons (même date, heure et nom, même dans le désordre « Marc Daubresse » / « Daubresse Marc » ; ligne « Client » rattachée à la seule autre réservation du créneau), garde le meilleur contact, écarte les annulées et les dates impossibles (« 2026-30-07 »), choisit la langue (note du client, sinon indicatif : +34 ES, +31/+32 NL, +33 FR, +44… EN ; modifiable d'un appui).
- Jours à rappeler (heure de Madrid) : demain ; **le mardi, on rappelle les clients du jeudi** (mercredi fermé) ; le mercredi, rien.
- Pas de rappel pour une réservation « À valider » (la valider d'abord). Contact impossible = raison affichée (« #ERROR! », numéro sans indicatif, notre propre adresse) ; rien n'est deviné : pour un numéro à 9 chiffres en 6/7, un bouton « C'est un numéro espagnol (+34) » laisse l'équipe confirmer avant d'envoyer. « +32 (0)470… » est corrigé (le (0) ne se compose pas). Heures « 9:00 », « 19h30 », « 19:30:00 » et dates « 28/11/2026 » acceptées ; une ligne restée illisible est signalée en haut de la page (jamais perdue en silence). Seuls les statuts exacts « Confirmée / Confirmada / Confirmed » comptent comme confirmés.
- `index.html` : une carte par réservation, heure en gros, 4 boutons de langue, gros bouton vert WhatsApp (bleu pour e-mail), aperçu du message, « ✓ Rappel envoyé » (gardé sur l'appareil, annulable). `?date=AAAA-MM-JJ` pour simuler un jour.
- `donnees-exemple.js` : copie **anonymisée** de l'onglet (mêmes défauts que les vraies lignes du 27/11).

## Tests
- `node labo/rappel-resa/test-rappel.js` (68) : jours cibles (mardi→jeudi, mercredi, 31/12, changement d'heure), fuseau Madrid, contacts (#ERROR!, +32 avec espaces, 0032, mobile ES, belge sans indicatif, nos propres coordonnées), doublons, langues, messages FR/ES/EN/NL, encodage `& # ? '`, mailto, « (0) », heures et dates à normaliser, « À confirmer », langue par nombre de mots, noms non latins, tri 9:00/12:00, 2 000 lignes.
- `python3 labo/rappel-resa/e2e-rappel.py` (58) : iPhone 13, 320 px en mode sombre, zones tactiles ≥ 44 px, aucun débordement, changement de langue, envoi marqué puis gardé au rechargement, annulation, mardi/mercredi/jour vide/date invalide, localStorage bloqué, nom piégé (`<img onerror>`, aussi dans une ligne illisible) neutralisé, confirmation +34 d'un appui, ligne illisible signalée, `aria-pressed` sur les langues. Réseau coupé pendant le test (seuls les fichiers locaux se chargent).

## Ce qu'il faudra pour de bon (agent « Évolution du QG »)
1. Lire l'onglet Reservations via le backend (aujourd'hui données d'exemple) et placer la page dans QG ▸ Journée « Rappels de demain » vers 17 h.
2. **« Envoyé » dans le classeur** (colonne Rappel) et non sur l'appareil : sinon deux téléphones peuvent envoyer deux fois le même rappel.
3. Réparer l'écriture du contact : les numéros au format « +32 … » sont écrits comme une formule et deviennent `#ERROR!` (4 lignes sur 20 au 27/11, dont toute la réservation du 4/12 qui n'a plus aucun numéro). Écrire le contact en texte (apostrophe devant).
4. Demander l'indicatif pays dans le formulaire de réservation (2 numéros sur 20 lignes sans indicatif).
