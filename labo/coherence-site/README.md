# Labo — Cohérence site public ↔ caisse (prototype du 24/11/2026)

**Idée** : Google, Google Maps (Ask Maps) et les assistants IA lisent les prix et les horaires dans les
données structurées (JSON-LD `Restaurant` → `Menu` → `MenuItem`) des pages FR/ES/EN/NL du site public.
Si ces prix ne sont pas ceux de la caisse, le client voit un prix en ligne et en paie un autre.
Sources : devournow.com, « 7 local SEO tactics for AI search & maps » (18/06/2026) ; Search Engine Journal,
« Google Ask Maps updates » (08/06/2026, maj 22/06/2026).

**Ce que fait le prototype** (lecture seule, ne modifie ni le site ni la caisse) :
- lit la carte de la caisse comme la caisse elle-même : carte intégrée `D` de `caisse.html`
  + modifications de l'onglet « Carte caisse » (optionnel), produits supprimés ou cachés exclus ;
- lit le JSON-LD des 4 pages du site (`docs/<langue>/index.html` du dépôt du site) ;
- rapproche chaque plat du site d'un produit de la caisse (nom exact, sinon nom très proche dans le même rayon ;
  un doute → « à vérifier », jamais compté juste) ; `equivalences.json` = noms différents exprès, confirmés ;
- signale : prix différents, plats du site introuvables en caisse, noms à vérifier, pages ES/EN/NL qui ne disent
  pas la même chose que le FR (nombre de plats, prix, horaires), mercredi indiqué ouvert, mauvais téléphone,
  « semi-gastronomique » / « 3CM1 » ;
- écrit un rapport lisible sur téléphone (`rapport-exemple.html`, `capture-rapport.png`).

**Usage**
```
node labo/coherence-site/coherence.js caisse.html <dépôt du site>/docs carte-caisse.json --html rapport.html --json rapport.json
node labo/coherence-site/test-coherence.js <dépôt du site>/docs     # 39 vérifications
```

`carte-caisse.json` = export de l'onglet « Carte caisse » (sans lui, le rapport l'indique en rouge : la vraie caisse
applique aussi ces modifications). `reglages.json` = faits fixes (jour fermé, téléphone, mots interdits dont TheFork),
à faire confirmer par Bastien. Un prix illisible, plusieurs prix pour un plat, « X ou Y », un prix libre (0 €) en caisse
ou une page sans plat ne sont jamais comptés justes : ils vont en « À vérifier » ou en alerte.

**Résultat sur les vraies données du 24/11/2026** (carte intégrée + onglet « Carte caisse », vide ce jour-là :
`carte-caisse-2026-11-24.json`) : 55 plats lus, 35 identiques, **13 prix différents** (ex. Carpaccio de bœuf
21,90 € sur le site / 12,90 € en caisse ; Seiche et Tartare inversés), 1 plat du site introuvable en caisse
(Ramen du jour), 6 à vérifier (dont « Espadon ou Thon » et « Sélection de viande » à prix libre en caisse) ;
les 4 langues concordent entre elles ; aucune règle enfreinte. Calcul en moins de 10 ms. Le prototype ne dit pas quel prix est le bon :
c'est à Bastien de trancher, plat par plat.

**Pour l'adopter** (agent « Site web » du mercredi) : lancer le contrôle avant chaque mise à jour du site et
chaque semaine, mettre une tâche « Prix site ≠ caisse » dans le QG ▸ À faire avec le rapport, et ne rien corriger
seul : Bastien choisit le bon prix.
