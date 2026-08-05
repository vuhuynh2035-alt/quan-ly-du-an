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

Double-click **`deploy.bat`** ở thư mục gốc repo:

- Tự **liệt kê project Firebase** đã mở trong Cursor (nhiều app)
- Mỗi app gắn **một tài khoản Firebase** (đổi TK tự động khi chọn)
- Luồng: đổi account → `git pull` → build → Hosting

Lần đầu: `firebase login:add` (lặp lại cho mỗi Google account), rồi `deploy.bat S`.  
Chi tiết: [scripts/DEPLOY.md](./scripts/DEPLOY.md).

## File không commit (bí mật)

- `public/firebase-config.js` — copy từ `firebase-config.example.js` trên mỗi máy
