# Deploy Firebase — đơn giản

## Cách dùng hàng ngày

1. Double-click **`deploy.bat`**  
   (hoặc shortcut **Deploy App** trên Desktop — chạy `tao-shortcut-desktop.bat` một lần)
2. Gõ **số** app → Enter
3. Xong

Tool tự: đổi tài khoản Firebase đúng app → `git pull` → build → Hosting.

## Lần đầu

- Nếu chưa có Firebase CLI / chưa login → `deploy.bat` tự hướng dẫn
- App mới chưa gắn TK → hỏi chọn email một lần (nhớ lại)

Thêm tài khoản Google khác: trong menu bấm **`M`** → **`T`**.

## Menu chính

| Việc | Thao tác |
|------|----------|
| Deploy app | Gõ `1`, `2`, … |
| Thoát | `Q` |
| Tuỳ chọn | `M` (ẩn app, thêm TK, shortcut Desktop, …) |

## Vì sao còn thấy app cũ?

Cursor vẫn nhớ project đã mở. Bam **`M`** → **`X`** để ẩn, hoặc dùng `exclude` trong config.

## File

| File | Vai trò |
|------|---------|
| `deploy.bat` | Chạy hàng ngày |
| `tao-shortcut-desktop.bat` | Tạo icon Desktop (1 lần) |
| `scripts/deploy-apps.local.json` | Email / exclude trên máy bạn (không commit) |
