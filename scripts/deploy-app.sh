#!/usr/bin/env bash
# ./scripts/deploy-app.sh [app-id]
set -euo pipefail
APP_ID="${1:-quan-ly-du-an}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
CONFIG="$ROOT/scripts/deploy-apps.config.json"
[ -f "$ROOT/scripts/deploy-apps.local.json" ] && CONFIG="$ROOT/scripts/deploy-apps.local.json"

PROJECT="$(node -e "const c=require(process.argv[1]);const a=c.apps.find(x=>x.id===process.argv[2])||c.apps[0];console.log(a.firebaseProject||'')" "$CONFIG" "$APP_ID")"
BRANCH="$(node -e "const c=require(process.argv[1]);const a=c.apps.find(x=>x.id===process.argv[2])||c.apps[0];console.log(a.branch||'main')" "$CONFIG" "$APP_ID")"

echo "Deploy $APP_ID / $PROJECT"
if [ -d .git ]; then
  git fetch origin "$BRANCH" || true
  git pull origin "$BRANCH" || true
fi
[ -f public/firebase-config.js ] || { echo "Thieu public/firebase-config.js"; exit 1; }
firebase use "$PROJECT"
npm run deploy:hosting
echo XONG
