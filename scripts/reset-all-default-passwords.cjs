/**
 * Reset tất cả tài khoản *@qlcv.local về mật khẩu mặc định 123456.
 * Chạy: node scripts/reset-all-default-passwords.js
 * Cần: firebase login (ADC) hoặc GOOGLE_APPLICATION_CREDENTIALS.
 */
const path = require("path");
const admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));

const DEFAULT_PASSWORD = "123456";

admin.initializeApp({ projectId: "quan-ly-du-an-7d651" });

async function listAllUsers(nextPageToken) {
  const res = await admin.auth().listUsers(1000, nextPageToken);
  const users = res.users || [];
  if (res.pageToken) {
    return users.concat(await listAllUsers(res.pageToken));
  }
  return users;
}

async function main() {
  const users = await listAllUsers();
  const targets = users.filter((u) => {
    const email = String(u.email || "").toLowerCase();
    return email.endsWith("@qlcv.local");
  });
  console.log("Tìm thấy", targets.length, "tài khoản @qlcv.local");
  let ok = 0;
  let fail = 0;
  for (const u of targets) {
    try {
      await admin.auth().updateUser(u.uid, { password: DEFAULT_PASSWORD });
      ok += 1;
      console.log("OK", u.email);
    } catch (err) {
      fail += 1;
      console.error("FAIL", u.email, err.message || err);
    }
  }
  console.log("Xong. OK=", ok, "FAIL=", fail);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
