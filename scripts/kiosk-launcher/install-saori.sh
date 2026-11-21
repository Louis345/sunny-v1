#!/bin/zsh
# Builds Sunny.app (Elli icon) from this folder and installs it on Saori's desktop.
# Usage: scripts/kiosk-launcher/install-saori.sh [host]   (default jtaylor@Saori.local)
set -euo pipefail
HOST="${1:-jtaylor@Saori.local}"
HERE="${0:A:h}"
TMP=$(mktemp -d)
APP="$TMP/Sunny.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$HERE/Sunny" "$APP/Contents/MacOS/Sunny"; chmod +x "$APP/Contents/MacOS/Sunny"
cp "$HERE/Sunny.icns" "$APP/Contents/Resources/Sunny.icns"
cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Sunny</string>
<key>CFBundleDisplayName</key><string>Sunny</string>
<key>CFBundleIdentifier</key><string>local.sunny.launcher</string>
<key>CFBundleExecutable</key><string>Sunny</string>
<key>CFBundleIconFile</key><string>Sunny</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>2</string>
<key>LSUIElement</key><true/>
</dict></plist>
EOF
zsh -n "$APP/Contents/MacOS/Sunny"
ssh "$HOST" 'rm -rf ~/Desktop/Sunny.app'
scp -rq "$APP" "$HOST":Desktop/
ssh "$HOST" 'touch ~/Desktop/Sunny.app; /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f ~/Desktop/Sunny.app'
rm -rf "$TMP"
echo " 🎮 [launcher] [install] [ok] host=$HOST"
