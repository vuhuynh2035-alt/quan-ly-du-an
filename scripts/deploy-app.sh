#!/usr/bin/env bash
# Deploy một app: git pull -> build -> deploy hosting
# Usage: ./scripts/deploy-app.sh [app-id] [--skip-pull]

set -euo pipefail
APP_ID="${1:-quan-ly-du-an}"
SKIP_PULL=0
for arg in "$@"; do
  if [ "$arg" = "--skip-pull" ]; then SKIP_PULL=1; fi
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$ROOT/scripts/deploy-apps.config.json"
LOCAL="$ROOT/scripts/deploy-apps.local.json"
[ -f "$LOCAL" ] && CONFIG="$LOCAL"
cd "$ROOT"

if [ ! -f "$CONFIG" ]; then
  EXAMPLE="$ROOT/scripts/deploy-apps.config.example.json"
  if [ -f "$EXAMPLE" ]; then
    cp "$EXAMPLE" "$CONFIG"
    echo "Da tao $CONFIG tu file mau."
  else
    echo "Khong tim thay config deploy."
    exit 1
  fi
fi

read_cfg() {
  node -e "
    const c=require(process.argv[1]);
    const a=c.apps.find(x=>x.id===process.argv[2]);
    if(!a){console.error('Khong tim thay app:', process.argv[2]); process.exit(1);}
    const acc=a.accountId ? (c.accounts||[]).find(x=>x.id===a.accountId) : null;
    console.log(JSON.stringify({app:a, account:acc}));
  " "$CONFIG" "$APP_ID"
}

CFG_JSON="$(read_cfg)"
BRANCH="$(node -e "console.log(JSON.parse(process.argv[1]).app.branch||'main')" "$CFG_JSON")"
PROJECT="$(node -e "console.log(JSON.parse(process.argv[1]).app.firebaseProject)" "$CFG_JSON")"
EMAIL="$(node -e "const j=JSON.parse(process.argv[1]); console.log((j.account&&j.account.email)||'')" "$CFG_JSON")"

echo "=== Deploy: $APP_ID ==="
echo "Thu muc: $ROOT"
echo "Project: $PROJECT"

if [ "$SKIP_PULL" -eq 0 ] && [ -d .git ]; then
  echo "Git pull origin $BRANCH..."
  git fetch origin "$BRANCH"
  git pull origin "$BRANCH"
else
  echo "Bo qua git pull"
fi

if [ -f public/app-version.json ]; then
  BUILD="$(node -e "console.log(require('./public/app-version.json').build)")"
  echo "Version tren Git (truoc build): v1.$(printf '%03d' "$BUILD")"
fi

if [ ! -f public/firebase-config.js ]; then
  echo "THIEU public/firebase-config.js — copy tu firebase-config.example.js"
  exit 1
fi

if [ -n "$EMAIL" ]; then
  echo "Firebase account: $EMAIL"
  firebase login:use "$EMAIL"
fi

firebase use "$PROJECT"

npm run deploy:hosting

BUILD="$(node -e "console.log(require('./public/app-version.json').build)")"
echo "XONG — da deploy v1.$(printf '%03d' "$BUILD")"
