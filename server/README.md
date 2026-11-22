# Selfhost backend (Phase 2)

Node 22 + Express + SQLite (`node:sqlite`) + WebSocket stub + Web Push subscription store.

## Chạy local

```powershell
cd server
copy .env.example .env
# sửa JWT_SECRET, ADMIN_*, VAPID_*
npm install
npm start
```

Health: `http://localhost:3000/api/health`

## Docker

```powershell
cd server
copy .env.example .env
docker compose up -d --build
```

Volume `/data` giữ `app.sqlite` + `uploads/`.

## Nginx (static + proxy)

Nginx phục vụ `dist` (hoặc `/du-an/`), proxy API/WS:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
location /ws {
    proxy_pass http://127.0.0.1:3000/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
location /uploads/ {
    proxy_pass http://127.0.0.1:3000/uploads/;
}
```

Client:

```html
<script>
  window.APP_BACKEND = "selfhost";
  window.SELFHOST_API = "https://YOUR_HOST/api";
</script>
```

Mặc định app vẫn dùng Firebase (`APP_BACKEND` không đặt hoặc `firebase`).

## Migrate dữ liệu

Xem `scripts/migrate/` ở gốc repo. Cần Firebase Admin service account để export; import đặt mọi mật khẩu = `123456` + `force_password_change=1`.
