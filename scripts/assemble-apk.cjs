const { spawnSync } = require("child_process");
const { existsSync, readFileSync } = require("fs");
const { isAbsolute, join } = require("path");

const android = join(__dirname, "..", "android");
const isWin = process.platform === "win32";
const gradlew = join(android, isWin ? "gradlew.bat" : "gradlew");

// Java .properties: backslash là ký tự thoát, nên đường dẫn Windows phải viết C:/... hoặc C:\\...
function readKeystoreProperties() {
  const file = join(android, "keystore.properties");
  if (!existsSync(file)) return {};
  const props = {};
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    const m = line.match(/^((?:\\.|[^=:\s\\])+)\s*[=:\s]\s*(.*)$/);
    if (!m) continue;
    const unescape = (s) =>
      s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, c) => {
        if (c.length === 5) return String.fromCharCode(parseInt(c.slice(1), 16));
        return { t: "\t", n: "\n", r: "\r", f: "\f" }[c] ?? c;
      });
    props[unescape(m[1])] = unescape(m[2]);
  }
  return props;
}

// Cùng nguồn với android/app/build.gradle: keystore.properties trước, rồi biến môi trường.
function resolveSigning() {
  const props = readKeystoreProperties();
  const fields = [
    ["storeFile", "QLDA_KEYSTORE_FILE"],
    ["storePassword", "QLDA_KEYSTORE_PASSWORD"],
    ["keyAlias", "QLDA_KEY_ALIAS"],
    ["keyPassword", "QLDA_KEY_PASSWORD"],
  ];
  const values = {};
  const missing = [];
  for (const [key, envKey] of fields) {
    values[key] = props[key] || process.env[envKey] || "";
    if (!values[key]) missing.push(`${key} (hoặc biến môi trường ${envKey})`);
  }
  if (missing.length) {
    console.error(
      "[Sign] Thiếu cấu hình ký APK release:\n  - " +
        missing.join("\n  - ") +
        "\nTạo android/keystore.properties (storeFile tính từ thư mục android/, storePassword, keyAlias, keyPassword)" +
        "\nhoặc đặt các biến môi trường QLDA_KEYSTORE_FILE / QLDA_KEYSTORE_PASSWORD / QLDA_KEY_ALIAS / QLDA_KEY_PASSWORD.",
    );
    process.exit(1);
  }
  const storePath = isAbsolute(values.storeFile) ? values.storeFile : join(android, values.storeFile);
  if (!existsSync(storePath)) {
    console.error(`[Sign] Không tìm thấy keystore: ${storePath} (storeFile / QLDA_KEYSTORE_FILE).`);
    process.exit(1);
  }
  return { storePath, keyAlias: values.keyAlias };
}

const signing = resolveSigning();
console.log(`[Sign] Ký APK release bằng ${signing.storePath} (alias ${signing.keyAlias}).`);

function envWithJdk() {
  const env = { ...process.env };
  const javaBin = isWin ? "java.exe" : "java";
  const sep = isWin ? ";" : ":";
  const homeDir = process.env.USERPROFILE || process.env.HOME || "";
  // Studio jbr is currently Java 25 (Gradle 8.14: major version 69). Prefer JBR 21.
  const candidates = isWin
    ? [
        join(homeDir, ".jdks", "jbr-21.0.11"),
        join(homeDir, ".jdks", "jbr-21"),
        "C:\\Program Files\\Android\\Android Studio\\jbr",
      ]
    : [
        join(homeDir, ".jdks", "jbr-21.0.11"),
        "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
      ];
  const home = candidates.find((p) => p && existsSync(join(p, "bin", javaBin)));
  if (home) {
    env.JAVA_HOME = home;
    // Windows: biến là "Path" — gán "PATH" riêng sẽ tạo biến thứ hai và che mất System32.
    const pathKey = Object.keys(env).find((k) => k.toUpperCase() === "PATH") || "PATH";
    env[pathKey] = `${join(home, "bin")}${sep}${env[pathKey] || ""}`;
  }
  const sdkCandidates = isWin
    ? [
        join(homeDir, "AppData", "Local", "Android", "Sdk"),
        process.env.ANDROID_HOME,
        process.env.ANDROID_SDK_ROOT,
      ]
    : [
        join(homeDir, "Library", "Android", "sdk"),
        process.env.ANDROID_HOME,
      ];
  const sdk = sdkCandidates.find((p) => p && existsSync(p));
  if (sdk) {
    env.ANDROID_HOME = sdk;
    env.ANDROID_SDK_ROOT = sdk;
  }
  return env;
}

const env = envWithJdk();
// cmd (shell: true) không tìm thấy gradlew.bat khi đường dẫn dự án có dấu tiếng Việt —
// gọi qua PowerShell, vốn xử lý Unicode trong đường dẫn.
const result = isWin
  ? spawnSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "& '.\\gradlew.bat' assembleRelease --no-daemon; exit $LASTEXITCODE"],
      {
        cwd: android,
        stdio: "inherit",
        env,
      },
    )
  : spawnSync(gradlew, ["assembleRelease", "--no-daemon"], {
      cwd: android,
      stdio: "inherit",
      env,
    });

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

const code = result.status ?? 1;
if (code === 0) {
  const fs = require("fs");
  const pkg = require("../package.json");
  const src = join(android, "app/build/outputs/apk/release/app-release.apk");
  if (!fs.existsSync(src)) {
    console.error(
      "[Sign] Gradle không tạo ra app-release.apk đã ký — kiểm tra lại keystore.properties / QLDA_KEYSTORE_* (đúng mật khẩu và alias).",
    );
    process.exit(1);
  }
  const destName = `QuanLyDuAn-v${pkg.version}.apk`;
  const dest = join(android, `app/build/outputs/apk/release/${destName}`);
  const rootApkDir = join(__dirname, "..", "APK");

  fs.copyFileSync(src, dest);
  console.log(`\nAPK generated: android/app/build/outputs/apk/release/${destName}`);

  if (!fs.existsSync(rootApkDir)) {
    fs.mkdirSync(rootApkDir, { recursive: true });
  }
  const rootApkDest = join(rootApkDir, destName);
  fs.copyFileSync(src, rootApkDest);
  console.log(`APK saved to: APK/${destName}`);
  console.log("[Sign] APK đã được Gradle ký (v1 + v2), sẵn sàng cài đặt trên thiết bị Android.");
}
process.exit(code);
