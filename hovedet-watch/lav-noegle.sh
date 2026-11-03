#!/bin/zsh
# Genererer Noegle.swift (gitignoreret) fra nøglefilen ~/.config/hoved/noegle,
# så watch-appen kan sende Authorization-headeren. Kør før build i Xcode.
# Nøglen må ALDRIG committes — apps-repoet er offentligt.
set -e
NOEGLE_FIL="$HOME/.config/hoved/noegle"
[ -f "$NOEGLE_FIL" ] || { echo "❌ Mangler $NOEGLE_FIL"; exit 1; }
UD="$(cd "$(dirname "$0")" && pwd)/Noegle.swift"
umask 077
{
  echo "// Genereret af lav-noegle.sh — gitignoreret, må aldrig committes."
  printf 'let apiNoegle = "%s"\n' "$(head -1 "$NOEGLE_FIL" | tr -d '[:space:]')"
} > "$UD"
echo "✅ $UD skrevet"
