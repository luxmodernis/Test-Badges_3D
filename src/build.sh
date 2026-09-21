#!/bin/sh
# Génère ../badge-expert-2-standalone.html (un seul fichier, sans serveur ni internet).
# Prérequis : npm i three@0.170.0 esbuild polygon-clipping (node_modules accessible via NODE_PATH,
# et esbuild dans le PATH).
set -e
cd "$(dirname "$0")"
export OUT="$(mktemp -t badge-bundle).js"
esbuild main.js --bundle --minify --format=iife --loader:.svg=text --outfile="$OUT"
python3 - <<'PY'
import os
b = open(os.environ['OUT']).read().replace('</script', '<\\/script')
t = open('template.html').read()
open('../badge-expert-2-standalone.html', 'w').write(t.replace('/*BUNDLE*/', b))
PY
cp ../badge-expert-2-standalone.html ../index.html     # index.html = même fichier, pour un hébergement statique (GitHub Pages)
rm -f "$OUT"
