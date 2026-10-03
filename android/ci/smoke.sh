#!/usr/bin/env bash
# Emulator smoke test (CI): install the app, open it, and check it really loads our website.
# Usage: smoke.sh <apk> <package> <website-host> <output-dir>
set -uo pipefail
APK="$1"; PKG="$2"; HOST="$3"; OUT="$4"
mkdir -p "$OUT"
note() { echo "::notice title=$1::$2"; }
fail() { echo "::error title=App smoke test::$1"; }

adb wait-for-device
adb install -r -g "$APK" || { fail "Couldn't install the app on the emulator"; exit 1; }
adb logcat -c
adb shell am start -W -n "$PKG/com.visionpay.app.MainActivity" >/dev/null

# Wait until the emulator itself is online (right after boot it often isn't yet).
for _ in $(seq 1 60); do
  adb shell dumpsys connectivity 2>/dev/null | grep -q "state: CONNECTED" && break
  sleep 2
done

ok=""
# A sleeping free-plan server can take ~1 minute to answer the first time. If the first try
# fails (offline screen), the app retries by itself when the network comes up.
for _ in $(seq 1 120); do
  if adb logcat -d -s VisionPay:I | grep -E "page-finished url=https://$HOST" | grep -qv "title=$"; then ok=1; break; fi
  if [ -z "$(adb shell pidof "$PKG" | tr -d '\r')" ]; then fail "The app stopped right after starting (crash)"; break; fi
  sleep 2
done
sleep 4
adb exec-out screencap -p > "$OUT/1-start.png" 2>/dev/null || true
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml "$OUT/1-start.xml" >/dev/null 2>&1 || true
adb logcat -d -s VisionPay:* > "$OUT/app-log.txt" || true
adb logcat -d -b crash > "$OUT/crash-log.txt" || true

if [ -z "$ok" ]; then
  fail "The app didn't load https://$HOST within 4 minutes"
  tail -15 "$OUT/app-log.txt" | while read -r l; do echo "::notice title=app log::$l"; done
  head -30 "$OUT/crash-log.txt" | while read -r l; do echo "::error title=crash::$l"; done
  exit 1
fi
note "Loaded" "$(grep page-finished "$OUT/app-log.txt" | tail -1 | sed 's/.*page-finished //')"
texts=$(grep -o 'text="[^"]\+"' "$OUT/1-start.xml" 2>/dev/null | sed 's/^text="//;s/"$//' | head -25 | paste -sd '|' -)
note "On screen" "${texts:-<no text found in the screen dump>}"
# Signed out, the app opens the login page: it must show our page, not an error.
if echo "$texts" | grep -qiE "Webpage not available|ERR_|You're offline"; then fail "The app shows an error page instead of the website"; exit 1; fi
if ! echo "$texts" | grep -qiE "Welcome back|Log in|Continue with"; then fail "The login page didn't appear on screen"; exit 1; fi
note "Login page" "The website's login page is on screen inside the app"

# Back button on the start page: the app goes to the background, it doesn't crash.
adb shell input keyevent 4; sleep 2
if [ -z "$(adb shell pidof "$PKG" | tr -d '\r')" ]; then fail "The app crashed on the back button"; exit 1; fi
# Reopen: comes back to the same page without a reload crash.
adb shell am start -W -n "$PKG/com.visionpay.app.MainActivity" >/dev/null; sleep 3
adb exec-out screencap -p > "$OUT/2-reopened.png" 2>/dev/null || true
if [ -z "$(adb shell pidof "$PKG" | tr -d '\r')" ]; then fail "The app crashed when reopened"; exit 1; fi
if [ -s "$OUT/crash-log.txt" ] && grep -q "$PKG" "$OUT/crash-log.txt"; then fail "Crash logged for the app"; head -30 "$OUT/crash-log.txt"; exit 1; fi
note "Smoke test" "Installed, opened $HOST, back button and reopen all fine"
