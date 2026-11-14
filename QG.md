# Le QG — Brasserie Phoenix

`qg.html` : le quartier général des agents IA de la brasserie, en plateau isométrique pixel-art.
Un seul fichier, aucune dépendance, servi par GitHub Pages comme le reste du dépôt.

## Ce qu'il fait

- **11 pôles** (Direction, Finance & Gestora, Réputation, Conformité & Données, Salle & Caisse, Cuisine & Production, Achats & Stock, Studio contenu, Équipe & RH, Clients & Club, Web & PWS) + le Chiringuito (pause) + la salle de réunion.
- **34 agents** qui circulent, travaillent à leur bureau, passent au café, se rendent visite. Chaque agent a une fiche : rôle, job, statut réel, compétences, outils, tâches, équipe.
- **Statut honnête** de chaque agent : `Tourne tout seul` (agents Apps Script planifiés, Zap factures), `À la demande, via Claude` (skills), `Page utilisée par l'équipe` (caisse, retours, carte…), `À construire` (stock, mermas, fiches techniques, agents PWS…).
- **Missions** : la barre du bas envoie une mission à Phénix, qui la confie au bon pôle (mots-clés, ou `@Prénom` pour viser un agent). Le chef de pôle vient au bureau de Phénix, repart, et rend son rapport. Si le QG est relié, la mission passe au chat IA du backend (`action:'chat'`) avec le rôle de l'agent ; sinon, mode démo + brief prêt à copier pour Claude.
- **Outils** : la barre du haut allume les agents qui utilisent un outil (Zapier, Gmail, Sheets…).
- **Inventaire** : tout ce qui existe déjà (pages, agents planifiés, skills, automatisations, chantiers), rangé par pôle.
- **Agents planifiés** : ils parlent à leur heure réelle (résumé 23 h 30, veille avis toutes les 2 h, factures lundi 9 h, bilan dimanche 17 h, santé des données 11 h). Le dimanche à 17 h, les chefs vont en réunion.

## Données

Même backend et même code admin que le Pilotage (`localStorage.phx_admin`, `phx_pilotage_data`).
Sans code : aucun chiffre affiché. Aucune clé dans le fichier — à vérifier avant chaque push
(`sk-ant`, `AQ.`, `AIza`, `api_key`).

## Faire évoluer

Les pôles sont dans `POLES`, les agents dans `AGENTS`, l'inventaire dans `INVENTAIRE`, les mots-clés de répartition dans `ROUTE`.
Quand un chantier est livré : passer l'agent de `chantier` à `auto`, `claude` ou `outil`, et retirer la ligne de `todo` du pôle.
