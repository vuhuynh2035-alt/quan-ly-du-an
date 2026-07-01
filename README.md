# Quản lý dự án SAREE

Ứng dụng điều phối đội thi công — giao việc, gợi ý nhân sự, tiến độ dự án.

## Chạy local

```powershell
npm install
npm run dev
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

## File không commit (bí mật)

- `public/firebase-config.js` — copy từ `firebase-config.example.js` trên mỗi máy
