# Test Badges 3D

Badge « S1 Expert » en 3D (Three.js) : chrome poli, bombé, dos peint (texte, logo TKGP, logo TAG Heuer).

## Tester
Ouvrir `index.html` dans un navigateur (aucun serveur ni connexion nécessaire : Three.js et les SVG sont embarqués).
Glisser pour tourner, molette / pincement pour zoomer, bouton « Voir le dos / Voir la face ». Rotation lente automatique.

## Sources
- `src/main.js` : génération de la géométrie et du rendu (extrusion des SVG, bombé, congés, peinture du dos, environnement chrome)
- `src/template.html` : page + interface
- `src/build.sh` : produit `index.html` (esbuild). Prérequis : `npm i three@0.170.0 esbuild polygon-clipping`
- `Badge-S1-Expert*.svg` : dessins d'origine (face, face 2, dos)
