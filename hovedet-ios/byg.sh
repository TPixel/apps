#!/bin/zsh
# Bygger Hovedet.app til iOS — ingen Xcode-projekt nødvendigt.
# Brug: ./byg.sh            → bygger til simulatoren (arm64)
#        ./byg.sh enhed      → bygger til fysisk iPhone (skal signeres bagefter, se LÆSMIG.md)
set -e
cd "$(dirname "$0")"

APP="Hovedet.app"
IKON_KILDE="$HOME/apps/hoved-ikon-512.png"
MIN_IOS="16.0"

if [[ "$1" == "enhed" ]]; then
  SDK_NAVN="iphoneos"
  MAAL="arm64-apple-ios${MIN_IOS}"
else
  SDK_NAVN="iphonesimulator"
  MAAL="arm64-apple-ios${MIN_IOS}-simulator"
fi
SDK="$(xcrun --sdk $SDK_NAVN --show-sdk-path)"

echo "→ Kompilerer ($SDK_NAVN)…"
xcrun -sdk $SDK_NAVN swiftc -O -target "$MAAL" -sdk "$SDK" main.swift -o Hovedet

echo "→ Bygger app-bundle…"
rm -rf "$APP"
mkdir -p "$APP"
cp Hovedet "$APP/Hovedet"
cp Info.plist "$APP/Info.plist"

echo "→ Laver app-ikon (Assets.car via actool)…"
IKONMAPPE="$(mktemp -d)"
AKTIVER="$IKONMAPPE/Assets.xcassets"
mkdir -p "$AKTIVER/AppIcon.appiconset"
sips -z 1024 1024 "$IKON_KILDE" --out "$AKTIVER/AppIcon.appiconset/icon-1024.png" >/dev/null
cat > "$AKTIVER/AppIcon.appiconset/Contents.json" <<'JSON'
{
  "images" : [
    { "filename" : "icon-1024.png", "idiom" : "universal", "platform" : "ios", "size" : "1024x1024" }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
JSON
cat > "$AKTIVER/Contents.json" <<'JSON'
{ "info" : { "author" : "xcode", "version" : 1 } }
JSON
xcrun actool --compile "$APP" \
  --platform $SDK_NAVN --minimum-deployment-target $MIN_IOS \
  --app-icon AppIcon --output-partial-info-plist "$IKONMAPPE/delvis.plist" \
  "$AKTIVER" >/dev/null
rm -rf "$IKONMAPPE"

echo "→ Signerer (ad hoc)…"
codesign --force --sign - "$APP"

rm -f Hovedet
echo "✓ Færdig: $(pwd)/$APP"
if [[ "$SDK_NAVN" == "iphonesimulator" ]]; then
  echo "  Installér i simulatoren:  xcrun simctl install booted $APP && xcrun simctl launch booted dk.ditzel.hovedet"
else
  echo "  Husk: enheds-build skal re-signeres med din egen profil, se LÆSMIG.md"
fi
