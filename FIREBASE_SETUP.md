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

## 6. Thông báo trên điện thoại

1. Mở app trên điện thoại, đăng nhập cloud
2. Cho phép thông báo
3. **Nhân sự** → chọn tên → **Bật thông báo trên thiết bị này**
4. Khi có giao việc mới, điện thoại nhận push

**iOS:** thêm vào Màn hình chính (PWA), iOS 16.4+.

## 7. Lệnh

| Lệnh | Mô tả |
|------|--------|
| `npm run dev` | Chạy local |
| `npm run deploy` | Build + deploy toàn bộ |
