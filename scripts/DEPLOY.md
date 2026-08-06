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

## Xuan Quynh bi len version cu?

May co 2 thu muc cung Firebase project:

- Dung: `...\GitHub\XUANQUYNH_HOTEL`
- Cu: `C:\hotel_app_firebase`

Menu se uu tien thu muc XUANQUYNH / GitHub. Truoc khi deploy, kiem tra dong **Thu muc:** — phai la XUANQUYNH_HOTEL. Sau deploy, xem dong **Commit:** co dung code moi khong. Neu web van cu: Ctrl+F5.

## File

| File | Viec |
|------|------|
| `Chay-Deploy.bat` | Bam chay menu deploy |
| `Tao-Shortcut-Desktop.bat` | Tao icon tren Desktop |
| `sua-config-deploy.bat` | Sua config bi hong |
| `deploy.bat` | Goi Chay-Deploy.bat |
