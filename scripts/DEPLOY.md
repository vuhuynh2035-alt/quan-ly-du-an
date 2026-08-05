# Deploy Firebase — nhiều app / nhiều tài khoản

## Vị trí công cụ (trong repo)

| File | Vai trò |
|------|---------|
| **`deploy.bat`** | Double-click trên Windows — mở menu |
| `scripts/deploy-select.ps1` | Menu chọn app |
| `scripts/deploy-lib.ps1` | Logic chung (git pull, Firebase, npm) |
| `scripts/deploy-app.ps1` | Deploy 1 app |
| `scripts/deploy-all.ps1` | Deploy tất cả app trong config |
| **`scripts/deploy-apps.config.json`** | Danh sách app + tài khoản Firebase |
| `scripts/deploy-apps.config.example.json` | Mẫu để thêm app / account |
| `scripts/deploy-apps.local.json` | Ghi đè riêng trên máy (không commit) |

> Sau khi `git pull`, các file trên nằm **ở thư mục gốc repo** (cùng cấp với `package.json`).

## Cách dùng (Windows)

1. **Cài một lần:** Node.js + `npm install -g firebase-tools`
2. **Đăng nhập Firebase:** `firebase login:add` (lặp lại nếu có nhiều tài khoản Google)
3. Double-click **`deploy.bat`** hoặc chạy `deploy.bat S` để xem hướng dẫn cấu hình
4. Chọn số app → script sẽ:
   - **`git pull origin main`** (luôn lấy code mới — tránh deploy bản cũ như v1.068)
   - Kiểm tra `public/firebase-config.js`, cài `node_modules` nếu thiếu
   - `firebase login:use` theo email trong config (hoặc tài khoản duy nhất đã login)
   - `firebase use <project>`
   - `npm run deploy:hosting` (tự bump version + build + đẩy Hosting)

## Menu

| Phím | Chức năng |
|------|-----------|
| `1`, `2`, … | Deploy app tương ứng |
| `A` | Deploy **tất cả** app |
| `L` | Liệt kê tài khoản Firebase đã `login:add` |
| `E` | Mở `deploy-apps.config.json` bằng Notepad |
| `S` | Hướng dẫn cấu hình lần đầu |
| `Q` | Thoát |

## Cấu hình `deploy-apps.config.json`

| Trường | Ý nghĩa |
|--------|---------|
| `accounts[].id` | Mã tài khoản (tự đặt) |
| `accounts[].email` | Email đã `firebase login:add` trên máy này |
| `apps[].id` | Mã app (dùng lệnh nhanh: `deploy.bat quan-ly-du-an`) |
| `apps[].path` | Để trống = repo hiện tại; hoặc `..\ten-thu-muc-app` |
| `apps[].branch` | Nhánh git pull trước deploy (thường `main`) |
| `apps[].firebaseProject` | Project ID trên Firebase Console |
| `apps[].accountId` | Khớp `accounts[].id` |
| `apps[].deploy` | `hosting` (chỉ web) hoặc `all` (rules + functions + hosting) |
| `apps[].siteUrl` | URL hiển thị sau deploy (tùy chọn) |

**Ghi đè riêng trên máy:** copy thành `scripts/deploy-apps.local.json` — script ưu tiên file này.

## Thêm app mới

1. Clone repo app vào máy (ví dụ cạnh repo này: `..\family-medical-record`).
2. Thêm block vào `apps[]` trong config (xem `deploy-apps.config.example.json`).
3. `firebase login:add` với email tài khoản Firebase của app đó.
4. Điền `email` vào `accounts[]` tương ứng.

## Lệnh nhanh (không cần menu)

```powershell
.\scripts\deploy-app.ps1 -AppId quan-ly-du-an
deploy.bat quan-ly-du-an
deploy.bat A
deploy.bat S
deploy.bat L

# Bo qua git pull (deploy code dang co tren may):
.\scripts\deploy-app.ps1 -AppId quan-ly-du-an -SkipPull

# Deploy full (rules + functions + hosting):
.\scripts\deploy-app.ps1 -AppId quan-ly-du-an -FullDeploy
```

## Linux / macOS

```bash
./scripts/deploy-app.sh quan-ly-du-an
```

(Script bash hỗ trợ app trong repo hiện tại; menu đa app dùng PowerShell trên Windows.)

## Vì sao trước đây ra v1.068?

Tool cũ **không `git pull`** trước deploy → build từ `public/app-version.json` cũ trên máy (67 → bump 68).  
GitHub `main` đã v1.072 nhưng Hosting vẫn bản cũ. Luồng mới **luôn pull trước** nên version khớp code mới.
