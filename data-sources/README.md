# Sources nutritionnelles

Ce dossier contient la source Excel officielle utilisée pour générer la base intégrée :

- `ciqual.xlsx` : fichier Excel Ciqual/Anses 2025.

La base générée dans l'application se trouve dans :

- `data/ciqual-foods.generated.ts`

Commande de régénération :

```powershell
npm.cmd run import:ciqual
```

Les valeurs nutritionnelles sont exprimées pour 100 g de partie comestible, conformément à la documentation Ciqual.
