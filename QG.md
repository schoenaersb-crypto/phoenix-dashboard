# Le QG — Brasserie Phoenix

`qg.html` est l'application du restaurant : le village des agents IA, installable sur le téléphone
(`qg.webmanifest`, « Ajouter à l'écran d'accueil »). Un seul fichier, aucune dépendance, servi par GitHub Pages.

## Les quatre onglets

- **Village** — le plateau isométrique : 11 pôles, 34 agents qui travaillent, circulent, se rendent visite. Fiche par agent, missions à Phénix (`@Prénom` pour viser un agent), filtre par outil, inventaire, réunion des chefs. Le décor grandit avec le niveau du village ; les évolutions acceptées apparaissent en chantier (grue).
- **Scanner** — photo ou PDF d'un ticket Z, d'une facture, d'un bon de livraison, d'un ticket de dépense ou d'une feuille de comptage. Gemini reconnaît la pièce et en sort les chiffres ; Bastien vérifie et valide ; la pièce part à sa place (Ventes, Factures, Stock) et l'image est rangée dans Drive.
- **Journée** — ce que le village attend de Bastien aujourd'hui (en pratique : la photo du Z, les photos des pièces reçues, les tâches), le niveau du village, la semaine, ce que les agents ont fait.
- **Makro** (depuis le pôle Achats, l'onglet Journée ou une tâche de Hugo) — tes vrais prix Makro lus dans chaque confirmation de commande, les hausses, un panier et « refaire ma dernière commande ».
- **À faire** — les tâches créées par les agents, l'envoi des factures payées à Nati en un geste, les propositions d'évolution, le stock estimé.

## L'agenda local : `agenda.json` (public)

Dates locales utiles (fêtes, événements, escales) relevées par la veille, chacune avec sa source :
`{maj, origine, consigne, evenements:[{du, au, heure?, evenement, lieu, source, url}]}` (dates `AAAA-MM-JJ`).
Le QG les affiche dans **Journée ▸ Autour de nous** (14 prochains jours, « en cours », « aujourd'hui »,
« restaurant fermé » pour un mercredi). Les agents le lisent à
`https://schoenaersb-crypto.github.io/phoenix-dashboard/agenda.json`. Mis à jour par l'agent Évolution du QG
à partir de la veille : dates réelles et sourcées uniquement, jamais d'invitation un mercredi.

## Échéances légales et concurrents : `echeances.json`, `concurrents.json` (publics)

- `echeances.json` : `{maj, origine, consigne, echeances:[{obligation, date? (AAAA-MM-JJ) | vers (texte), statut, note, source, url}]}`.
  Le QG les affiche dans **Journée ▸ Échéances légales** (à venir seulement) avec un **rappel 30 jours avant** la date.
  Une date calculée par un cabinet reste « à confirmer avec Nati ».
- `concurrents.json` : `{maj, origine, consigne, nous:{lunch, formule, detail, source}, concurrents:[{nom, lieu, creneau, prix?, prix_detail?, note?, remarque?, releve, source, url}]}`.
  Affichés dans **Journée ▸ Concurrents suivis** ; un prix sous notre prix le plus bas (formule 15 €) est signalé.
- Agents : `https://schoenaersb-crypto.github.io/phoenix-dashboard/echeances.json` et `…/concurrents.json`.
  Mis à jour par l'agent Évolution du QG à partir de la veille hebdomadaire : données réelles et sourcées uniquement, « non relevé » plutôt qu'un chiffre deviné.

## Le moteur : `village.gs` (backend, hors dépôt)

Le backend Apps Script n'est pas dans ce dépôt public (retiré le 19/10/2026). Le module `village.gs`
s'ajoute comme un fichier à part dans le projet Apps Script, avec une seule ligne dans le routeur de `Code.gs` :

```js
if (typeof villageRoute_ === 'function') { var vlg = villageRoute_(body); if (vlg) return json(vlg); }
```

Actions : `makro_sync` (lecture des PDF « Order-Confirmation » de Makro dans Gmail → feuilles `Makro_Prix` et `Makro_Commandes`, livraisons → `Stock`), `scan`, `scan_valide`, `cloture_photo`, `cloture_valide` (le bouton « Photographier le Z » du Pilotage),
`village`, `tache_maj`, `evolution_maj`, `gestora_envoi`. Feuilles créées : `Scans`, `Journal`, `Taches`, `Evolutions`, `Stock`
(+ colonnes `Fichier`, `ScanId` ajoutées à `Factures`, sans toucher aux autres). Déclencheur `vlgBattement` toutes les heures.

Règles fixes : rien n'est écrit sans validation ; une facture impayée ne part jamais chez Nati ; rien ne part
à l'extérieur sans un geste de Bastien.

## Comment le village évolue

1. Chaque nuit à 3 h, Phénix (Gemini) lit l'état du village et propose au plus une amélioration (3 en attente maximum).
2. Bastien l'accepte dans « À faire » → un e-mail `[QG] Évolution acceptée — …` part vers sa boîte.
3. Chaque dimanche soir, la tâche planifiée Claude « Évolution du QG » lit ces e-mails, construit le chantier
   et ouvre une proposition de modification sur ce dépôt. Le code backend éventuel est envoyé par e-mail, jamais publié ici.

## Faire évoluer à la main

Pôles : `POLES` · agents : `AGENTS` · inventaire : `INVENTAIRE` · répartition des missions : `ROUTE`.
Avant chaque push, vérifier l'absence de clé : `sk-ant`, `AQ.`, `AIza`, `api_key`, `PHX-`.
