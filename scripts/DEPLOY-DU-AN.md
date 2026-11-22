# Deploy tĩnh Nginx `/du-an/` (Firebase) + Phase 2 selfhost

## A) Đóng gói trên máy có `public/firebase-config.js` thật

```powershell
npm run package:du-an
```

Ra file `du-an.zip` (có `firebase-config.js` cùng cấp `index.html`).

### Deploy một lệnh (SSH)

```powershell
# Nginx /var/www/du-an
.\scripts\deploy-du-an-remote.ps1 -HostName 10.201.1.8 -User root -RemotePath /var/www/du-an -ReloadNginx

# Hoặc container Docker đang chạy (root base /, cổng 8084)
.\scripts\deploy-du-an-remote.ps1 -HostName 10.201.1.8 -User root -Mode docker -DockerContainer quan-ly-du-an-app -SkipPackage
```

Lưu ý: zip `package:du-an` dùng `base=/du-an/`. Container hiện tại trên HP phục vụ **gốc `/`** — nên rebuild Docker từ repo (`bash deploy-docker.sh`) hoặc `docker compose up -d --build` sau `git pull`, kèm `public/firebase-config.js` trên server.

## Trên server (Nginx + Cloudflare)

1. Giải nén `du-an.zip` vào `/var/www/du-an` (ghi đè bản cũ).
2. Kiểm tra có `/var/www/du-an/firebase-config.js` cùng cấp `index.html` (không dùng file mẫu `YOUR_API_KEY`).
3. Reload Nginx: `sudo nginx -t && sudo systemctl reload nginx`.
4. Trình duyệt: Hard refresh (Ctrl+F5 / xoá cache) trang `/du-an/`.
5. Đăng nhập bằng tài khoản Firebase hiện có (mật khẩu không đổi) khi `APP_BACKEND` mặc định (firebase).

Thiếu `firebase-config.js` trên server → Settings «Kết nối cloud» báo offline / blank.

## B) Phase 2 — Selfhost (Node + SQLite)

Xem `server/README.md`. Tóm tắt trên Proxmox/HP:

```bash
cd /root/quan-ly-du-an
git pull
cp server/.env.example server/.env   # sửa JWT_SECRET, ADMIN_*, VAPID_*
cd server && docker compose up -d --build
```

Nginx proxy `/api/` và `/ws` → `127.0.0.1:3000`. Client:

```js
window.APP_BACKEND = "selfhost";
window.SELFHOST_API = "https://YOUR_HOST/api";
```

**Chưa bật selfhost** cho đến khi migrate xong + proxy OK. Mặc định giữ Firebase.

### Cloudflare Tunnel (trycloudflare tạm)

```bash
# Cài cloudflared, rồi:
cloudflared tunnel --url http://127.0.0.1:8084
# hoặc trỏ thêm service selfhost :3000 trong config tunnel có hostname cố định
```

Cần đăng nhập Cloudflare trên máy chủ (`cloudflared tunnel login`) — không làm thay được từ máy dev nếu chưa có credential.

## Migrate dữ liệu

`scripts/migrate/README.md` — cần Firebase Admin service account.
