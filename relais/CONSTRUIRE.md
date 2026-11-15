# Phoenix Relais 3.0 — reconstruire l'exe

`relais-source.js` + `tables.js` (tables cp858/cp850/cp437/cp1252) → `relais.js` en remplaçant la ligne `__TABLES__` par le contenu de `tables.js`.

```
node --experimental-sea-config sea-config.json      # main: relais.js, useCodeCache false
cp node.exe PhoenixRelais.exe                        # node.exe win-x64 de la MÊME version que le node local
npx postject PhoenixRelais.exe NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
```
Compatible config.json de la 2.x (port 8123, imprimantes ip/port/alias/taille/gras, codepage, colonnes, coupe).
Routes : `/` page d'état · `/imprime` · `/calibre?dest=` · `/sync/version|etat|maj` · `/sante` · fichiers de l'appli (GitHub, copie locale en secours).
