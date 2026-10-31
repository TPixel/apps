#!/bin/zsh
# Bygger Hovedet.app fra main.swift — ingen Xcode-projekt nødvendigt.
# Brug: ./byg.sh
set -e
cd "$(dirname "$0")"

APP="Hovedet.app"
IKON_KILDE="$HOME/apps/hoved-ikon-512.png"

echo "→ Kompilerer…"
swiftc -O main.swift -o Hovedet

echo "→ Bygger app-bundle…"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp Hovedet "$APP/Contents/MacOS/Hovedet"
cp Info.plist "$APP/Contents/Info.plist"

echo "→ Laver ikon (.icns)…"
IKONSAET="$(mktemp -d)/Hovedet.iconset"
mkdir -p "$IKONSAET"
for S in 16 32 128 256 512; do
  sips -z $S $S "$IKON_KILDE" --out "$IKONSAET/icon_${S}x${S}.png" >/dev/null
  D=$((S * 2))
  sips -z $D $D "$IKON_KILDE" --out "$IKONSAET/icon_${S}x${S}@2x.png" >/dev/null
done
iconutil -c icns "$IKONSAET" -o "$APP/Contents/Resources/Hovedet.icns"
rm -rf "$(dirname "$IKONSAET")"

echo "→ Signerer (ad hoc)…"
codesign --force --sign - "$APP"

rm -f Hovedet
echo "✓ Færdig: $(pwd)/$APP"
