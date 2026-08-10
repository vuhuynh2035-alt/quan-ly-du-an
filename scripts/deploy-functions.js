/**
 * Deploy Cloud Functions với FUNCTIONS_DISCOVERY_TIMEOUT cao hơn
 * (tránh lỗi Timeout after 10000 khi load index.js trên Windows).
 */
import { spawnSync } from "node:child_process";

process.env.FUNCTIONS_DISCOVERY_TIMEOUT =
  process.env.FUNCTIONS_DISCOVERY_TIMEOUT || "60";

const args = [
  "-y",
  "firebase-tools@latest",
  "deploy",
  "--only",
  "functions",
  ...process.argv.slice(2),
];

const r = spawnSync("npx", args, {
  stdio: "inherit",
  env: process.env,
  shell: true,
});

process.exit(r.status == null ? 1 : r.status);
