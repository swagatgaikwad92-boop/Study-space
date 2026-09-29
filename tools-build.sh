#!/bin/sh
# Regenerates the service worker precache list + cache version. Run after adding/removing files.
cd "$(dirname "$0")" || exit 1
LIST=$(find . -type f \( -name '*.html' -o -name '*.js' -o -name '*.mjs' -o -name '*.css' -o -name '*.json' -o -name '*.svg' -o -name '*.png' \) ! -name 'sw.js' ! -path './node_modules/*' ! -path './.git/*' | sed 's|^\./||' | sort | awk 'BEGIN{printf "["} {printf "%s\"./%s\"", (NR>1?", ":""), $0} END{printf "]"}')
VER=$(find . -type f ! -name 'sw.js' ! -path './.git/*' -exec cksum {} \; | cksum | cut -d' ' -f1)
sed -i -E "s|^const VERSION = .*|const VERSION = '$VER';|; s|^const PRECACHE = .*|const PRECACHE = /*__PRECACHE__*/$LIST;|" sw.js
echo "sw.js updated: $VER"
