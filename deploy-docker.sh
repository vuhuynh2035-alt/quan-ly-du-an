#!/bin/bash
# Script tự động cập nhật và khởi chạy Quản Lý Dự Án SAREE trên Docker (Máy chủ HP / Proxmox)

echo "=== DANG DONG BO VA CAP NHAT QUAN LY DU AN SAREE TREN DOCKER ==="
git pull origin main
docker compose down
docker compose up -d --build
echo "=== TRIEN KHAI THANH CONG! ==="
echo "Truy cap noi bo: http://$(hostname -I | awk '{print $1}'):8084"
echo "Truy cap domain qua Cloudflare Tunnel (Cong 8084): https://duan.saigonref.com (hoac domain ban gan)"
