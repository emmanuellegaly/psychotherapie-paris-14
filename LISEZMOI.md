# Site d'Emmanuelle Galy, Gestalt-thérapeute à Paris 14e

Sources du site https://www.psychotherapie-paris-14.fr : des pages HTML simples, sans base de données,
publiées par GitHub Pages à partir du dossier `docs/`.

## Organisation

| Dossier / fichier | Rôle |
|---|---|
| `contenu/pages/`, `contenu/articles/` | Texte des pages et des articles (HTML ou Markdown), avec leurs informations en tête de fichier |
| `contenu/site.json` | Informations communes : coordonnées du cabinet, menu, pied de page, données structurées |
| `contenu/redirections.json` | Anciennes adresses redirigées vers les nouvelles |
| `gabarits/` | Modèles HTML communs à toutes les pages |
| `ressources/less/` | Feuilles de style en LESS (variables, composants partagés, pages), compilées en CSS par `construire.js` |
| `ressources/` | Scripts, polices (licence OFL), images, icônes |
| `outils/` | Préparation des images (redimensionnement, retrait des métadonnées) et des icônes |
| `construire.js` | Fabrique le site final dans `docs/` |
| `servir.js` | Aperçu local sur http://localhost:8080 |
| `verifier.js` | Vérifications automatiques (pages, liens, plan du site, poids) |
| `docs/` | Site final généré, publié tel quel. Ne pas le modifier à la main |

## Fabriquer le site

Outils nécessaires : Node.js et le compilateur LESS officiel (version épinglée dans `package.json`).

```
npm install
node construire.js
node verifier.js
```

## Droits

Les textes et les photographies du site ne sont pas libres de droits : merci de ne pas les reproduire sans accord.
Les polices Bodoni Moda et Albert Sans sont sous licence SIL Open Font License (fichiers `OFL-*.txt`),
la bibliothèque Three.js sous licence MIT (`ressources/js/LICENSE-three.txt`).
