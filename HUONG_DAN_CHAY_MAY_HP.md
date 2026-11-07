# HƯỚNG DẪN ĐỒNG BỘ VÀ CHẠY TRÊN MÁY HP (HPG2Z4)
### Dự án: Quản Lý Dự Án SAREE (quan-ly-du-an)

Tài liệu này hướng dẫn cách đưa chương trình từ máy Surface Book 2 sang **máy HP** để sửa chữa, vận hành nội bộ hoặc chạy làm máy chủ phục vụ toàn bộ điện thoại, máy tính bảng và máy tính trong gia đình / công ty.

---

## 1. Cơ chế hoạt động & Đồng bộ giữa 2 máy

```
 ┌──────────────────────┐         git push          ┌─────────────────────────┐
 │   Surface Book 2     ├──────────────────────────►│   GitHub Repository     │
 │  (Máy lập trình)     │                           │ vuhuynh2035-alt/        │
 └──────────────────────┘                           │ quan-ly-du-an           │
                                                    └────────────┬────────────┘
                                                                 │ git pull
                                                                 ▼
                                                    ┌─────────────────────────┐
                                                    │   Máy HP (HPG2Z4)       │
                                                    │  (Máy chủ phục vụ LAN)  │
                                                    │   Cổng: 8084            │
                                                    └─────────────────────────┘
```

- **Trên máy Surface:** Sửa code, kiểm thử (`npm test`), biên dịch (`npm run build`), sau đó lưu và đẩy lên GitHub:
  ```powershell
  git add .
  git commit -m "Cải tiến và nâng cấp ứng dụng"
  git push
  ```
- **Trên máy HP:** Kéo mã nguồn mới về và chạy:
  ```powershell
  git pull
  npm install
  npm run build
  ```

---

## 2. Cách chạy trên máy chủ HP (Windows Native)

### Bước 1: Mở cổng tường lửa Windows (Chỉ làm 1 lần đầu)
- Vào thư mục dự án trên máy HP: `C:\Quan_Ly_Du_An`.
- Nhấp chuột phải vào file **`Mo-Tuong-Lua-Windows.bat`** -> chọn **"Run as administrator"**.
- File sẽ tự động mở cổng **8084** trong Windows Defender Firewall để các thiết bị khác (điện thoại, laptop) có thể kết nối vào máy HP qua mạng Wi-Fi.

### Bước 2: Khởi động máy chủ
- **Cách 1 (Có cửa sổ theo dõi):** Double-click file **`Chay-Server.bat`**.
  - File tự động kiểm tra `node_modules` và biên dịch bản build nếu chưa có.
  - Tự động mở trình duyệt web tới `http://localhost:8084`.
  - Hiển thị đầy đủ danh sách địa chỉ IP mạng nội bộ của máy HP (ví dụ: `http://192.168.1.xxx:8084`).
- **Cách 2 (Chạy ngầm không hiện cửa sổ):** Double-click file **`Chay-Server-An.vbs`**.
  - Rất tiện khi muốn đưa vào thư mục **Startup** của Windows (`Win + R` -> gõ `shell:startup`) để máy chủ HP cứ bật nguồn là tự động chạy web server.

---

## 3. Cách chạy bằng Docker trên máy HP (Nếu cài Docker / Proxmox)

Nếu máy chủ HP đang chạy Proxmox hoặc Linux/Docker:

### Cập nhật và triển khai chỉ với 1 lệnh:
```bash
bash deploy-docker.sh
```

Hoặc chạy thủ công qua Docker Compose:
```bash
docker compose down
docker compose up -d --build
```
- Ứng dụng chạy qua container Nginx siêu nhẹ, hiệu năng cao và tiết kiệm RAM.
- Cổng truy cập: `http://<IP_MÁY_HP>:8084`.

---

## 4. Địa chỉ truy cập ứng dụng

| Thiết bị | Đường dẫn truy cập |
| :--- | :--- |
| **Trực tiếp trên máy HP** | `http://localhost:8084` |
| **Điện thoại / iPad cùng Wi-Fi** | `http://<IP_MÁY_HP>:8084` |
| **Môi trường phát triển dev** | `npm run dev` (cổng 5173) |

---

## 5. Danh mục các file hỗ trợ máy HP

| Tệp tin | Vai trò |
| :--- | :--- |
| `server.js` | Web server Node/Express phục vụ tệp tĩnh, tự nhận diện IP mạng Wi-Fi, quản lý bộ nhớ đệm PWA |
| `Chay-Server.bat` | File 1-click khởi động máy chủ và mở trình duyệt trên Windows |
| `Chay-Server-An.vbs` | Khởi chạy máy chủ chạy ngầm (không hiện cửa sổ đen cmd) |
| `Mo-Tuong-Lua-Windows.bat` | Tự động tạo luật mở cổng 8084 trên Windows Firewall |
| `Dockerfile` | Kịch bản đóng gói ứng dụng đa tầng (Node builder -> Nginx alpine) |
| `docker-compose.yml` | Cấu hình dịch vụ Docker cho máy chủ |
| `nginx.conf` | Cấu hình Nginx tối ưu cho ứng dụng SPA / PWA, nén Gzip |
| `deploy-docker.sh` | Script 1-click tự `git pull` và cập nhật container |
