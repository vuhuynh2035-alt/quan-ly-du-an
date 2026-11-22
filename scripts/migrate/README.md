# Migrate Firebase → SQLite selfhost

1. Tải **service account** JSON (Firebase Console → Project settings → Service accounts). **Không commit** file này.
2. Export:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\serviceAccount.json"
npm install firebase-admin --no-save
node scripts/migrate/export-firestore.js --out migrate-export.json
```

3. Import (Node 22+ có `node:sqlite`; cần `bcryptjs` trong `server/`):

```powershell
cd server
npm install
cd ..
node scripts/migrate/import-sqlite.js --in migrate-export.json --db server/data/app.sqlite
```

Mọi mật khẩu = `123456`, `force_password_change=1`.

4. Chạy selfhost (`cd server && npm start` hoặc `docker compose up`) rồi đặt client:

```js
window.APP_BACKEND = "selfhost";
window.SELFHOST_API = "https://YOUR_HOST/api";
```

**Chưa có trong skeleton:** upload Storage files, port đủ ~20 callable Cloud Functions, UI bắt buộc đổi mật khẩu lần đầu, Web Push gửi thật (chỉ lưu subscription).
