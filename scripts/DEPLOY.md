# Deploy Firebase — huong dan

## Cach dung (khong can go lenh)

1. Vao thu muc `C:\Quan ly du an` (File Explorer)
2. Double-click **`Tao-Shortcut-Desktop.bat`** (1 lan)
3. Tren Desktop xuat hien **Deploy App** / **Chay Deploy**
4. Lan sau: double-click icon Desktop → go so app → Enter

Hoac double-click **`Chay-Deploy.bat`** ngay trong thu muc du an.

## Tool tu lam khi chon so

- Doi tai khoan Firebase dung app
- git pull (neu loi se DUNG — khong deploy ban cu)
- build
- firebase deploy --project dung-id

## Xuan Quynh — thu muc nao dung?

**Giu (ban dung):**

`C:\Users\VUHUYNH\OneDrive\Documents\GitHub\XUANQUYNH_HOTEL`

**Xoa (ban copy cu):**

`C:\hotel_app_firebase`

Menu co the hien them ban thu 3 vi tool quet:

1. Moi project tung mo trong Cursor
2. Cac thu muc trong `scanRoots` (vd. GitHub)
3. Cac thu muc anh em cung cap voi `Quan ly du an` (vd. truc tiep o `C:\`)

Cach nhan: nhin dong **Path:** duoi moi so trong menu — do la vi tri that.

### Don sach de khong nham

1. Pull tool deploy moi nhat (cung Firebase project chi con 1 dong)
2. Trong menu: **M → X** → chon so cua ban SAI (an khoi list)
3. Trong File Explorer: xoa thu muc copy (`hotel_app_firebase` va ban thu 3 neu co)
4. **M → R** quet lai — chi con XUANQUYNH_HOTEL

Khong xoa thu muc dang mo trong Cursor. Dong Cursor/tab do truoc.

## File

| File | Viec |
|------|------|
| `Chay-Deploy.bat` | Bam chay menu deploy |
| `Tao-Shortcut-Desktop.bat` | Tao icon tren Desktop |
| `sua-config-deploy.bat` | Sua config bi hong |
| `deploy.bat` | Goi Chay-Deploy.bat |
