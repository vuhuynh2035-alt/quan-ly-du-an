# Báo Cáo Rà Soát, Sửa Chữa & Nâng Cấp — Quản Lý Dự Án SAREE
### Thư mục làm việc: `C:\Quan_Ly_Du_An` | GitHub: `vuhuynh2035-alt/quan-ly-du-an`

---

## 1. Đồng bộ mã nguồn từ GitHub về máy
- Đã tải toàn bộ kho mã nguồn từ `https://github.com/vuhuynh2035-alt/quan-ly-du-an.git` về thư mục workspace `C:\Quan_Ly_Du_An`.
- Xử lý xung đột chữ hoa/chữ thường trong Git (`Tao-Shortcut-Desktop.bat` và `tao-shortcut-desktop.bat`) vốn gây cảnh báo collision trên hệ điều hành Windows.

---

## 2. Các lỗi đã sửa & cải tiến chất lượng

### 2.1. Cấu hình Firebase Web App chính thức
- Trước đây dự án thiếu tệp `public/firebase-config.js` khiến ứng dụng không thể kết nối tới Firebase Project `quan-ly-du-an-7d651`.
- Đã trích xuất cấu hình chính thức từ Firebase CLI của tài khoản và tạo file `public/firebase-config.js`:
  - `projectId`: `quan-ly-du-an-7d651`
  - `appId`: `1:661560654820:web:fa79a21065f96d87c425f1`
  - `storageBucket`: `quan-ly-du-an-7d651.firebasestorage.app`
  - `apiKey`: `AIzaSyD99qAJ5hWM0cgYnM2kwJIH6JE6s2MrWhg`
  - Đồng thời cập nhật quy trình để Vite tự động copy file cấu hình này vào `dist/` khi biên dịch.

### 2.2. Loại bỏ lỗi phá hủy giao diện nghiêm trọng (Global Error Trap)
- Trong `index.html` trước đây có đoạn mã:
  ```javascript
  window.addEventListener('error', function(e) {
    document.body.innerHTML = '<div style="color:red;padding:20px;z-index:9999;position:relative;background:white;">Global Error: ' + e.message + '<br>' + (e.error ? e.error.stack : '') + '</div>';
  });
  ```
  **Vấn đề:** Bất kỳ lỗi nhỏ nào từ tiện ích trình duyệt, tiện ích chặn quảng cáo, sự cố tải tài nguyên phụ hoặc lỗi mạng không nghiêm trọng đều khiến toàn bộ `document.body.innerHTML` bị xóa sạch và thay bằng màn hình đỏ, làm mất dữ liệu người dùng đang nhập.
- **Giải pháp:** Đã thay thế bằng trình bắt lỗi an toàn (safe error logger & non-intrusive floating banner), ghi lại chi tiết vào `console.error` và chỉ hiển thị thông báo góc màn hình tự tắt sau 6 giây, hoàn toàn không xóa bỏ cấu trúc DOM của ứng dụng. Bổ sung thêm trình theo dõi `unhandledrejection`.

### 2.3. Vá bảo mật các gói phụ thuộc (NPM Security Fix)
- Rà soát lỗ hổng bằng `npm audit`: Đã xử lý triệt để 5 lỗ hổng bảo mật cấp cao (High) ở các gói phụ thuộc `nanoid`, `postcss`, `source-map-js`, `vite`.
- Kiểm tra tính tương thích của Firebase SDK (v11.x) và Vite (v6.x) đảm bảo hệ thống ổn định và mượt mà.

---

## 3. Hệ thống phục vụ & Triển khai trên máy HP (HPG2Z4)

Đồng bộ với các hệ thống tương tự đã vận hành thành công (`Family Health Manager`, `Teacher AI`):

1. **Máy chủ Node/Express `server.js` (Cổng 8084):**
   - Phục vụ bản build tĩnh trong `dist/`.
   - Tự động nhận diện tất cả các địa chỉ IP mạng nội bộ của máy chủ HP và in ra màn hình đường link truy cập cho điện thoại/laptop cùng mạng Wi-Fi.
   - Thiết lập header `Cache-Control` chuẩn PWA: ngăn chặn cache stale đối với các file phiên bản (`manifest.json`, `app-version.json`, `firebase-config.js`, `firebase-messaging-sw.js`), đồng thời kích hoạt cache dài hạn cho các file bundle đã băm mã (assets hash).
   - Tự động xử lý điều hướng Single Page Application (SPA Fallback).
2. **Kịch bản chạy Windows:**
   - `Chay-Server.bat`: 1-click khởi động máy chủ và tự động mở trình duyệt.
   - `Chay-Server-An.vbs`: Khởi chạy ngầm không hiện màn hình cmd (thích hợp cho thư mục Startup của Windows).
   - `Mo-Tuong-Lua-Windows.bat`: Mở cổng 8084 trên Windows Defender Firewall để các thiết bị khác trong nhà / cơ quan truy cập được.
3. **Đóng gói container Docker (Proxmox Server):**
   - `Dockerfile`: Multi-stage build tối ưu kích thước.
   - `docker-compose.yml`: Cấu hình container chạy cổng 8084.
   - `nginx.conf`: Nén Gzip, điều hướng SPA, tối ưu cache.
   - `deploy-docker.sh`: 1-click cập nhật git và khởi động lại container trên Linux.

---

## 4. Kiểm thử tự động (Smoke Test)
- Đã thiết lập bộ kịch bản kiểm thử tự động tại `scripts/test-app.cjs` tích hợp vào lệnh `npm test`.
- Kịch bản chạy trên trình duyệt Chromium/Edge không đầu (headless), kiểm tra:
  - Khởi tạo DOM và render thẻ `#app`
  - Đọc đúng tiêu đề ứng dụng "QUẢN LÝ DỰ ÁN"
  - Kiểm tra hiển thị màn hình đăng nhập an toàn
  - Kiểm tra responsive trên kích thước màn hình điện thoại (375x812)
  - Đo lường và xác nhận **0 lỗi console runtime**.
