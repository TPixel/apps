#!/bin/bash
# Bygger "Vinyl Mini.app" og lægger den i ~/Applications
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/Applications/Vinyl Mini.app"
TMP="$(mktemp -d)"
mkdir -p "$HOME/Applications"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc -O -o "$APP/Contents/MacOS/VinylMini" "$DIR/main.swift" -framework Cocoa -framework WebKit

# Ikon fra plader-icon-512.png
SRC="$DIR/../plader-icon-512.png"
IS="$TMP/AppIcon.iconset"; mkdir -p "$IS"
for s in 16 32 64 128 256 512; do
  sips -z $s $s "$SRC" --out "$IS/icon_${s}x${s}.png" >/dev/null
  d=$((s*2)); [ $d -le 1024 ] && sips -z $d $d "$SRC" --out "$IS/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$IS" -o "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Vinyl Mini</string>
  <key>CFBundleDisplayName</key><string>Vinyl Mini</string>
  <key>CFBundleIdentifier</key><string>dk.ditzel.vinyl-mini</string>
  <key>CFBundleExecutable</key><string>VinylMini</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/><key>NSAllowsArbitraryLoadsInWebContent</key><true/></dict>
</dict></plist>
EOF
codesign --force --deep -s - "$APP" 2>/dev/null || true
rm -rf "$TMP"
echo "Bygget: $APP"
