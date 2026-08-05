# Deploy Firebase — nhiều app / nhiều tài khoản

## Cách dùng (Windows)

1. Double-click **`deploy.bat`** ở thư mục gốc repo (hoặc copy cả thư mục `scripts/` + `deploy.bat` sang nơi bạn hay deploy).
2. Chọn số app → script sẽ:
   - **`git pull origin main`** (luôn lấy code mới nhất — tránh deploy bản cũ như v1.068)
   - `npm run deploy:hosting` (tự bump version + build + đẩy Firebase Hosting)
   - Đổi **Firebase account** / **project** theo config

## Cấu hình

Sửa **`scripts/deploy-apps.config.json`**:

| Trường | Ý nghĩa |
|--------|---------|
| `accounts[].email` | Email đã `firebase login:add` trên máy này |
| `apps[].path` | Để trống = repo hiện tại; hoặc `..\ten-thu-muc-app` |
| `apps[].branch` | Nhánh git pull trước deploy (thường `main`) |
| `apps[].firebaseProject` | Project ID trên Firebase |
| `apps[].accountId` | Khớp `accounts[].id` để `firebase login:use` |
| `apps[].deploy` | `hosting` hoặc `all` |

File mẫu đầy đủ: **`deploy-apps.config.example.json`**

Ghi đè riêng trên máy (không commit): copy thành **`deploy-apps.local.json`** — script ưu tiên file này nếu có.

## Thêm app mới

1. Clone repo app vào máy (ví dụ cạnh repo này: `..\family-medical-record`).
2. Thêm block vào `apps[]` trong config.
3. Trên máy đó: `firebase login:add` với email tài khoản Firebase của app.
4. Điền `email` vào `accounts[]` tương ứng.

## Lệnh nhanh (không cần menu)

```powershell
.\scripts\deploy-app.ps1 -AppId quan-ly-du-an
deploy.bat quan-ly-du-an
deploy.bat A
```

## Vì sao trước đây ra v1.068?

Tool cũ **không `git pull`** trước deploy → build từ `public/app-version.json` cũ trên máy (67 → bump 68).  
GitHub `main` đã v1.072 nhưng Hosting vẫn bản cũ. Luồng mới **luôn pull trước** nên version khớp code mới.
