# Deploy Firebase — nhiều app Cursor / nhiều tài khoản

## Mục tiêu

Một lần double-click **`deploy.bat`**:

1. **Liệt kê** các project Firebase đã mở trong Cursor (và thư mục sibling / `scanRoots`)
2. Bạn **chọn số** app
3. Tool **tự đổi tài khoản Firebase** → `git pull` → build → deploy Hosting

## Vị trí

| File | Vai trò |
|------|---------|
| **`deploy.bat`** | Double-click trên Windows |
| `scripts/deploy-select.ps1` | Menu |
| `scripts/deploy-lib.ps1` | Quét Cursor + logic deploy |
| `scripts/deploy-apps.config.json` | Config mẫu trong repo |
| **`scripts/deploy-apps.local.json`** | Config máy bạn (email, mapping) — **không commit** |

## Cách hoạt động

### Tự tìm app từ Cursor

Tool đọc:

- `%APPDATA%\Cursor\User\workspaceStorage\*\workspace.json`
- `%APPDATA%\Cursor\User\globalStorage\storage.json`
- Thư mục **cùng cấp** với repo này
- `scanRoots` trong config (nếu bạn khai báo)

Chỉ hiện folder có **`firebase.json`** hoặc **`.firebaserc`** + `package.json`.

### Nhiều tài khoản Firebase

1. Đăng nhập từng tài khoản Google (một lần):

```powershell
firebase login:add
firebase login:add
firebase login:list
```

2. Lần đầu chọn app → menu hỏi **email nào** gắn với app đó → lưu vào `accountByPath` trong `deploy-apps.local.json`
3. Lần sau: tự `firebase login:use <email>` rồi deploy

## Menu

| Phím | Chức năng |
|------|-----------|
| `1`, `2`… | Deploy app đó (đổi TK + pull + build + hosting) |
| `A` | Deploy tất cả |
| `R` | Quét lại Cursor |
| `L` | Liệt kê tài khoản Firebase đã login |
| `E` | Sửa config |
| `S` | Hướng dẫn |
| `Q` | Thoát |

## Cấu hình tùy chọn

```json
{
  "discoverCursor": true,
  "scanRoots": ["D:\\projects"],
  "accounts": [
    { "id": "saree", "label": "SAREE", "email": "a@gmail.com" }
  ],
  "accountByPath": {
    "D:\\projects\\quan-ly-du-an": "a@gmail.com"
  },
  "apps": []
}
```

| Trường | Ý nghĩa |
|--------|---------|
| `discoverCursor` | `true` = tự quét Cursor |
| `scanRoots` | Thêm thư mục cha để quét app con |
| `accountByPath` | Gắn đường dẫn tuyệt đối → email Firebase |
| `apps` | Ghi đè thủ công (label, branch, deploy full…) |

## Lệnh nhanh

```powershell
deploy.bat
deploy.bat 1
deploy.bat quan-ly-du-an
deploy.bat A
deploy.bat S
```

## Vì sao trước đây ra version cũ?

Tool cũ không `git pull` → deploy code local cũ. Luồng mới **luôn pull** trước khi build.
