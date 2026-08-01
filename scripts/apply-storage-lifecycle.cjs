/**
 * Apply 31-day Storage lifecycle for attendance/report photo prefixes.
 * Firebase CLI cannot deploy lifecycle via firebase.json — use gcloud.
 *
 * Usage: node scripts/apply-storage-lifecycle.cjs [bucket-name]
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const lifecycleFile = path.join(__dirname, "..", "storage.lifecycle.json");
if (!fs.existsSync(lifecycleFile)) {
  console.error("Missing storage.lifecycle.json");
  process.exit(1);
}

let bucket = process.argv[2] || process.env.FIREBASE_STORAGE_BUCKET || "";
if (!bucket) {
  try {
    const rc = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", ".firebaserc"), "utf8")
    );
    const project = (rc.projects && rc.projects.default) || "";
    // Prefer modern default bucket id used by this project.
    if (project) bucket = `${project}.firebasestorage.app`;
  } catch (_e) {
    /* ignore */
  }
}
if (!bucket) {
  console.error("Pass bucket name: node scripts/apply-storage-lifecycle.cjs <bucket>");
  process.exit(1);
}

const gs = bucket.startsWith("gs://") ? bucket : `gs://${bucket}`;
console.log("Applying lifecycle from storage.lifecycle.json to", gs);
execFileSync(
  "gcloud",
  ["storage", "buckets", "update", gs, `--lifecycle-file=${lifecycleFile}`],
  { stdio: "inherit" }
);
console.log("Done. Verify: gcloud storage buckets describe", gs, "--format=json(lifecycle_config)");
