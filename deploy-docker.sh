#!/bin/bash
# Script tự động cập nhật và khởi chạy Quản Lý Dự Án SAREE trên Docker (Máy chủ HP / Proxmox)
set -euo pipefail

echo "=== DANG DONG BO VA CAP NHAT QUAN LY DU AN SAREE TREN DOCKER ==="
git pull origin main
if [ ! -s public/firebase-config.js ]; then
  echo "THIEU public/firebase-config.js. File nay khong duoc dong bo qua Git."
  echo "Hay sao chep cau hinh Firebase that len may HP roi chay lai."
  exit 1
fi
if grep -Eq 'YOUR_API_KEY|YOUR_PROJECT_ID' public/firebase-config.js; then
  echo "public/firebase-config.js van con gia tri mau. Hay dien cau hinh Firebase that."
  exit 1
fi
docker compose up -d --build
echo "=== TRIEN KHAI THANH CONG! ==="
echo "Truy cap noi bo: http://$(hostname -I | awk '{print $1}'):8084"
echo "Truy cap domain qua Cloudflare Tunnel (Cong 8084): https://duan.saigonref.com (hoac domain ban gan)"
