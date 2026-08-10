# Deploy Firebase — huong dan

## Cach dung 1 cham (khuyen nghi)

Double-click **`Deploy-TuDong.bat`** (hoac shortcut **Deploy Tu Dong** tren Desktop).

Tu dong chay het:

1. Commit thay doi local (neu co) — file bi `.gitignore` (vd. `firebase-config.js`) khong commit
2. `git fetch` + checkout `main` + pull/merge
3. `git push` neu local dang ahead
4. Kiem tra code (`projView` / `isProjLocked`)
5. Build + deploy Firebase (hosting + functions)

Neu loi **Timeout after 10000** khi load Functions: script da set `FUNCTIONS_DISCOVERY_TIMEOUT=60` va Admin SDK dung `onInit()` (khong init luc discovery).

Tuy chon PowerShell:

```powershell
.\scripts\deploy-auto.ps1 -SkipCommit          # khong commit
.\scripts\deploy-auto.ps1 -HostingOnly         # chi hosting
.\scripts\deploy-auto.ps1 -CommitMessage "..." # message commit
```

## Menu chon nhieu app

1. Double-click **`Tao-Shortcut-Desktop.bat`** (1 lan) → tao icon Desktop
2. **Deploy App** / **Chay-Deploy.bat** → go so app → Enter

## File

| File | Viec |
|------|------|
| `Deploy-TuDong.bat` | **1 cham**: commit + git + deploy full |
| `Deploy-Full-QuanLyDuAn.bat` | Goi Deploy-TuDong |
| `Chay-Deploy.bat` | Menu chon app |
| `Tao-Shortcut-Desktop.bat` | Tao icon Desktop |
| `scripts/deploy-auto.ps1` | Logic deploy tu dong |
| `sua-config-deploy.bat` | Sua config bi hong |
| `deploy.bat` | Goi Chay-Deploy.bat |
