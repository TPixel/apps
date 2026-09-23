#!/bin/bash
# Installerer WiiM-bro som en launchd-agent på Mac'en, så den starter selv ved login og genstarter hvis den dør.
# Brug:  ./install.sh 192.168.1.50        (IP'en på WiiM Ultra — ses i WiiM Home → enhed → indstillinger)
set -e
WIIM_IP="$1"
if [ -z "$WIIM_IP" ]; then echo "Brug: ./install.sh <WiiM-IP>"; exit 1; fi
if ! command -v node >/dev/null; then echo "Node.js mangler. Installér fx med: brew install node"; exit 1; fi

DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node)"
LABEL="dk.ditzel.wiim-bro"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/wiim-bro.log"
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string><string>$DIR/wiim-bro.js</string>
    <string>--wiim</string><string>$WIIM_IP</string>
    <string>--port</string><string>8787</string>
    <string>--root</string><string>$DIR/..</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 1
echo "Installeret og startet. Log: $LOG"
echo "Åbn på iPad:  http://$(scutil --get LocalHostName).local:8787/vinyl.html"
tail -n 5 "$LOG" 2>/dev/null || true
