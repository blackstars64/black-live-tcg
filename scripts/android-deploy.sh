#!/bin/bash
# Déploiement Android fiable — bypass le adb flaky de expo run:android
# Cause du bug Expo : install lancé avant que Gradle ferme le file handle sur l'APK.
# Fix : build → sleep → install direct (sans kill-server qui déstabilise).
# Usage: npm run android:deploy
set -e

ADB=/home/blackstars/Android/Sdk/platform-tools/adb
APK=android/app/build/outputs/apk/debug/app-debug.apk
PKG=com.blackstars64.blacklivetcg

# ─── Build ────────────────────────────────────────────────────────────
echo "🔨 Build APK..."
(cd android && ./gradlew assembleDebug --quiet)

# Laisser Gradle fermer ses file handles avant de lire l'APK
sleep 2

# ─── Résoudre le device ───────────────────────────────────────────────
DEVICE=$("$ADB" devices | awk '/\tdevice$/{print $1}' | head -1)

if [ -z "$DEVICE" ]; then
  echo "❌ Aucun device ADB connecté"
  exit 1
fi

echo "📱 Device : $DEVICE"

# ─── Install avec retry ───────────────────────────────────────────────
install_apk() {
  "$ADB" -s "$DEVICE" install -r -d "$APK" 2>&1
}

if install_apk | grep -q "Success"; then
  echo "✅ APK installé"
else
  echo "⚠️  Install -r échoué — désinstallation + install propre..."
  "$ADB" -s "$DEVICE" uninstall "$PKG" &>/dev/null || true
  sleep 1
  "$ADB" -s "$DEVICE" install -d "$APK"
  echo "✅ APK installé (fresh)"
fi

# ─── Lancer l'app ─────────────────────────────────────────────────────
"$ADB" -s "$DEVICE" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 &>/dev/null && \
  echo "🚀 App lancée" || true
