# Deploy Firebase — luôn lên bản mới nhất

## Vì sao hay “deploy xong mà thiếu tính năng”?

Thường **không phải Firebase lỗi**, mà deploy nhầm bản cũ hoặc trình duyệt giữ cache:

1. **`git pull` lỗi nhưng vẫn deploy code local** (bản cũ trên máy).
2. **Đang đứng nhánh / thư mục cũ** (bản sao Cursor khác, chưa merge `main`).
3. **`deploy.bat` trước đây chỉ deploy hosting** — tính năng nằm ở Cloud Functions không lên.
4. **Trình duyệt cache `/js/*`** (kể cả `firebase-bootstrap.js`) tới 24 giờ — HTML mới nhưng JS cũ.
5. **Merge PR trên GitHub nhưng máy chưa `pull`**, hoặc pull nhầm folder.

## Cách deploy đúng (Khuyến nghị)

### Quản lý dự án SAREE

Double-click **`Deploy-Full-QuanLyDuAn.bat`** trong `C:\Quan ly du an`.

File này bắt buộc:

- `checkout main` + `merge --ff-only origin/main`
- So khớp `HEAD` với `origin/main` (lệch → **dừng**, không deploy)
- Kiểm tra marker code mới trong `index.html` và `dist/index.html`
- Build lại `dist`
- Deploy **hosting + functions**

### Menu nhiều app (`deploy.bat` / `Chay-Deploy.bat`)

1. Double-click **`deploy.bat`** (hoặc shortcut Desktop)
2. Chọn số app — xem kỹ **đường dẫn thư mục** in ra
3. Tool tự: đổi TK → **sync ff-only** → build → deploy  
   Với `quan-ly-du-an-7d651`: luôn **hosting + functions**

Nếu sync git lỗi → **dừng hẳn** (không còn im lặng deploy code cũ).

## Sau khi deploy

1. Mở site → **Ctrl+F5** (xoá cache cứng)
2. Kiểm tra `/app-version.json` hoặc meta `app-build` tăng số
3. Cuối log deploy phải thấy **commit SHA** trùng `main` vừa merge

## Checklist nhanh

- [ ] PR đã **merged vào `main`** trên GitHub
- [ ] Deploy từ đúng folder (ưu tiên `C:\Quan ly du an`)
- [ ] Log có `OK git: main @……`
- [ ] Có deploy **functions** nếu tính năng dùng Cloud Function
- [ ] Ctrl+F5 trên trình duyệt

## File

| File | Việc |
|------|------|
| `Deploy-Full-QuanLyDuAn.bat` | Deploy QLDA an toàn nhất (nên dùng) |
| `Chay-Deploy.bat` / `deploy.bat` | Menu chọn app |
| `Tao-Shortcut-Desktop.bat` | Tạo icon Desktop |
| `sua-config-deploy.bat` | Sửa config bị hỏng |
