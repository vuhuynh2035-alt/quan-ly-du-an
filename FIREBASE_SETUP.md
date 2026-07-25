# Triển khai Firebase — Quản lý dự án SAREE

Ứng dụng chạy trên **Firebase Hosting** (mọi hệ điều hành qua trình duyệt), **Firestore** đồng bộ realtime giữa nhiều máy, và **Cloud Messaging** gửi thông báo giao việc tới điện thoại.

## 1. Tạo project Firebase

1. Vào [Firebase Console](https://console.firebase.google.com/) → **Add project**
2. Bật **Authentication** → Sign-in method → **Email/Password**
3. Bật **Firestore Database** → Create database (production mode)
4. Bật **Cloud Messaging** → tab **Web Push certificates** → Generate key pair → copy **Key pair** (VAPID)

## 2. Đăng ký Web app

Project Settings → Your apps → **Web** → copy `firebaseConfig`.

```powershell
copy public\firebase-config.example.js public\firebase-config.js
```

Mở `public/firebase-config.js`, điền `FIREBASE_CONFIG` và `FIREBASE_VAPID_KEY`.

## 3. Cài đặt & liên kết CLI

```powershell
npm install
npm install -g firebase-tools
firebase login
firebase use --add
```

## 4. Deploy lần đầu

```powershell
npm run deploy
```

## 5. Dùng trên nhiều máy

- Mở URL Hosting (ví dụ `https://YOUR_PROJECT.web.app`)
- Đăng nhập cùng tài khoản, **mã đội** giống nhau (mặc định `saree`)
- Mọi thay đổi sync realtime

## 6. Thông báo trên điện thoại (khi đóng app)

Điều kiện bắt buộc:

1. Mở bằng **HTTPS** (URL Hosting), không dùng IP LAN
2. **Thêm app vào màn hình chính** (PWA) — bắt buộc trên iPhone (iOS 16.4+)
3. Đăng nhập cloud → **Cài đặt** → bật thông báo
4. Checklist trong app phải có: HTTPS · PWA · quyền granted · có token FCM
5. Bấm **Gửi push thử từ server**, rồi **đóng app** — phải thấy banner hệ thống

Khi đã bật đúng:

- Giao việc mới / tin nhắn riêng → push khi app đóng
- Người gửi thấy trạng thái: **đã gửi → đã nhận → đã đọc** (tick chat, dòng trạng thái ở Tiến độ)

Sau mỗi lần deploy Functions/Hosting: trên điện thoại mở lại app đã cài, bật thông báo một lần nếu token cũ bị xóa.

## 7. Lệnh

| Lệnh | Mô tả |
|------|--------|
| `npm run dev` | Chạy local |
| `npm run deploy` | Build + deploy toàn bộ (hosting, rules, functions, indexes) |
| `npm run deploy:functions` | Chỉ Cloud Functions |
| `npm run deploy:rules` | Chỉ Firestore rules |
