# Deploy tĩnh Nginx `/du-an/` (Firebase)

Đóng gói trên máy có `public/firebase-config.js` thật:

```powershell
npm run package:du-an
```

Ra file `du-an.zip` (có `firebase-config.js` cùng cấp `index.html`).

## Trên server (Nginx + Cloudflare)

1. Giải nén `du-an.zip` vào `/var/www/du-an` (ghi đè bản cũ).
2. Kiểm tra có `/var/www/du-an/firebase-config.js` cùng cấp `index.html` (không dùng file mẫu `YOUR_API_KEY`).
3. Reload Nginx: `sudo nginx -t && sudo systemctl reload nginx`.
4. Trình duyệt: Hard refresh (Ctrl+F5 / xoá cache) trang `/du-an/`.
5. Đăng nhập bằng tài khoản Firebase hiện có (mật khẩu không đổi).
6. Đặt lại mật khẩu selfhost **chưa** hoạt động — Phase 2 (Node/SQLite) chưa triển khai; dữ liệu vẫn lấy từ Firebase.

Thiếu `firebase-config.js` trên server → Settings «Kết nối cloud» báo offline / blank. Không bật `APP_BACKEND=selfhost` cho đến khi có `SELFHOST_API`.
