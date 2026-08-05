#!/usr/bin/env bash
# Deploy một app: git pull -> build -> deploy hosting
# Usage: ./scripts/deploy-app.sh [app-id]

set -euo pipefail
APP_ID="${1:-quan-ly-du-an}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$ROOT/scripts/deploy-apps.config.json"
cd "$ROOT"

echo "=== Deploy: $APP_ID ==="
echo "Thu muc: $ROOT"

BRANCH="$(node -e "const c=require('$CONFIG');const a=c.apps.find(x=>x.id==='$APP_ID');if(!a)process.exit(1);console.log(a.branch||'main')")"
echo "Git pull origin $BRANCH..."
git fetch origin "$BRANCH"
git pull origin "$BRANCH"

if [ -f public/app-version.json ]; then
  BUILD="$(node -e "console.log(require('./public/app-version.json').build)")"
  echo "Version tren Git (truoc build): v1.$(printf '%03d' "$BUILD")"
fi

if [ ! -f public/firebase-config.js ]; then
  echo "CANH BAO: thieu public/firebase-config.js"
  exit 1
fi

npm run deploy:hosting

BUILD="$(node -e "console.log(require('./public/app-version.json').build)")"
echo "XONG — da deploy v1.$(printf '%03d' "$BUILD")"
