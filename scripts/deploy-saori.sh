#!/usr/bin/env bash
# One-command deploy to the Saori kiosk. Run from a dev Mac:  scripts/deploy-saori.sh <commit-sha>
# Steps (the recipe used for every deploy since 2026-11-09):
#   1. Saori is reachable and idle (no server log write in the last 10 minutes; never restart during a session).
#   2. Back up ~/SunnyData/*.db and the girls' context into ~/SunnyData/backups/<timestamp>.
#   3. Fast-forward Saori's checkout to <sha> (never a merge commit, never a reset).
#   4. Build. A failed build stops here and the running kiosk is left untouched.
#   5. Restart the kiosk (sunny:run --subject homework; never --homework-domain) and wait for its startup checks.
set -euo pipefail

SHA="${1:-}"
HOST="${SAORI_HOST:-jtaylor@Saori.local}"
IDLE_MINUTES="${IDLE_MINUTES:-10}"
if [[ -z "$SHA" ]]; then echo "usage: scripts/deploy-saori.sh <commit-sha>" >&2; exit 2; fi
if ! git cat-file -e "$SHA^{commit}" 2>/dev/null; then echo " 🎮 [deploy] [commit] [unknown] $SHA is not in this checkout" >&2; exit 2; fi
if ! git branch -r --contains "$SHA" | grep -q .; then echo " 🎮 [deploy] [commit] [not-pushed] push $SHA first; Saori fetches from GitHub" >&2; exit 2; fi

say() { echo " 🎮 [deploy] $*"; }
remote() { ssh -o ConnectTimeout=8 -o BatchMode=yes "$HOST" "export PATH=/opt/homebrew/bin:\$PATH; cd ~/Development/sunny; $1"; }

say "[reach] [checking] $HOST"
if ! remote 'true' 2>/dev/null; then
  say "[reach] [failed] Saori did not answer: asleep, taken, or its VPN is on. Nothing changed."
  exit 1
fi

idle=$(remote "f=\$(ls -t logs/server/*.log 2>/dev/null | head -1); [ -z \"\$f\" ] && echo 9999 || echo \$(( (\$(date +%s) - \$(stat -f %m \"\$f\")) / 60 ))")
if (( idle < IDLE_MINUTES )) && [[ "${FORCE_BUSY:-}" != "1" ]]; then
  say "[idle] [busy] the server log was written ${idle} min ago; a child may be playing. Nothing changed."
  exit 1
fi
say "[idle] [ok] last server log write ${idle} min ago"

ts=$(date +%Y%m%d-%H%M%S)
remote "mkdir -p ~/SunnyData/backups/$ts && cp ~/SunnyData/*.db* ~/SunnyData/backups/$ts/ 2>/dev/null; tar czf ~/SunnyData/backups/$ts/context.tgz src/context/ila src/context/reina && echo ok" | grep -q ok
say "[backup] [saved] ~/SunnyData/backups/$ts"

remote "git fetch -q && git merge -q --ff-only $SHA && git log --oneline -1" | sed 's/^/ 🎮 [deploy] [checkout] /'

if ! remote "npm run build > ~/deploy-build.log 2>&1"; then
  say "[build] [failed] see ~/deploy-build.log on Saori; the running kiosk was not restarted"
  remote "tail -20 ~/deploy-build.log"
  exit 1
fi
say "[build] [passed]"

remote "pkill -f sunnyRun; pkill -f launch-kiosk; pkill -f 'server.ts --serve-static'; pkill -f kiosk-browser-profile; sleep 3; SUNNY_KIOSK_DEBUG_PORT=9222 nohup npm run sunny:run -- --subject homework > ~/kiosk-run.log 2>&1 < /dev/null & echo started" >/dev/null
say "[kiosk] [restarting]"

for _ in $(seq 1 40); do
  if remote "grep -aq 'kiosk-visible\] \[confirmed\]' ~/kiosk-run.log" 2>/dev/null; then
    remote "grep -a 'startup-check\|kiosk-visible' ~/kiosk-run.log | cut -c1-200"
    if remote "grep -aq 'startup-check.*\(failed\|refused\)' ~/kiosk-run.log"; then
      say "[kiosk] [up-with-warnings] read the startup-check lines above"
      exit 1
    fi
    say "[done] Saori runs $(git log --oneline -1 "$SHA")"
    exit 0
  fi
  sleep 5
done
say "[kiosk] [not-confirmed] no kiosk-visible line after 200 s; see ~/kiosk-run.log on Saori"
remote "tail -20 ~/kiosk-run.log | cut -c1-200"
exit 1
