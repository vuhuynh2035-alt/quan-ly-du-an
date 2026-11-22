# Quản lý dự án SAREE

Ứng dụng điều phối đội thi công — giao việc, gợi ý nhân sự, tiến độ dự án.

## Chạy local

```powershell
npm install
npm run dev
```

## Quy ước version

- Mỗi lần chạy `npm run dev`, `npm run build`, `npm run deploy`, `npm run deploy:hosting` sẽ tự tăng build version.
- Build được lưu ở `public/app-version.json` và tự đồng bộ vào thẻ `<meta name="app-build">` trong `index.html`.
- Có thể tăng version thủ công bằng:

```powershell
npm run version:bump
```

## Đồng bộ giữa 2 máy (Git)

**Máy 1 (đã push):** mỗi lần sửa code:

```powershell
git add .
git commit -m "Mô tả thay đổi"
git push
```

**Máy 2 (lần đầu):**

```powershell
git clone https://github.com/TEN-GITHUB/quan-ly-du-an.git
cd quan-ly-du-an
npm install
copy public\firebase-config.example.js public\firebase-config.js
npm run dev
```

> Thay `TEN-GITHUB` bằng username GitHub của bạn (ví dụ `vuhuynh2035-alt`).

**Máy 2 (các lần sau):**

```powershell
git pull
npm install
```

## Firebase (tùy chọn)

Xem [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) — deploy cloud sync realtime + thông báo điện thoại.

### Deploy lên Hosting (Windows)

**Cách dễ nhất (không cần gõ lệnh):**

1. Vào thư mục `C:\Quan ly du an`
2. Double-click **`Tao-Shortcut-Desktop.bat`** (một lần) → có icon trên Desktop
3. Lần sau: double-click **`Deploy App`** trên Desktop → chọn số app → xong

Hoặc double-click luôn **`Chay-Deploy.bat`** / **`deploy.bat`** trong thư mục dự án.

Chi tiết: [scripts/DEPLOY.md](./scripts/DEPLOY.md).

## File không commit (bí mật)

- `public/firebase-config.js` — copy từ `firebase-config.example.js` trên mỗi máy

### Đóng gói tĩnh Nginx (`/du-an/`)

```powershell
npm run package:du-an
```

Script **bắt buộc** có `public/firebase-config.js` hợp lệ (không nằm trong Git). File này phải có trong zip/`dist-du-an` cùng cấp `index.html`. Thiếu → app offline, không có dữ liệu cloud. Mặc định vẫn dùng Firebase; Phase 2 selfhost nằm trong `server/`.

Hướng dẫn upload server: [scripts/DEPLOY-DU-AN.md](./scripts/DEPLOY-DU-AN.md). Selfhost: [server/README.md](./server/README.md).

```powershell
# Deploy zip qua SSH
.\scripts\deploy-du-an-remote.ps1 -HostName <IP> -User root -RemotePath /var/www/du-an -ReloadNginx

# Selfhost Docker
npm run selfhost:docker:up
```
