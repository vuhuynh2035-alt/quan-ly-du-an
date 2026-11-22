// Đồng bộ versionName/versionCode của android/app/build.gradle theo version trong package.json.
// Do «Công cụ phát hành» gọi qua bumpCommand (không sửa tay).
const { readFileSync, writeFileSync } = require("fs");
const { join } = require("path");

const root = join(__dirname, "..");
const gradlePath = join(root, "android", "app", "build.gradle");

function versionCodeFrom(version) {
  const parts = String(version || "0.0.0").split(".").map((n) => Number.parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts[0] * 1000000 + parts[1] * 1000 + Math.min(parts[2], 999);
}

const version = process.argv[2] || require(join(root, "package.json")).version;
try {
  const gradle = readFileSync(gradlePath, "utf8")
    .replace(/versionCode\s+\d+/, `versionCode ${versionCodeFrom(version)}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
  writeFileSync(gradlePath, gradle);
  console.log(`Android version -> ${version} (code ${versionCodeFrom(version)})`);
} catch {
  console.log("Bỏ qua: chưa có android/app/build.gradle");
}
