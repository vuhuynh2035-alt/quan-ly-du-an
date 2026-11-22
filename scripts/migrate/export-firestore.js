/**
 * Export Firestore (+ Auth user list) sang JSON để import SQLite.
 *
 * Yêu cầu:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json
 *   hoặc FIREBASE_SERVICE_ACCOUNT_PATH
 *
 * Chạy:
 *   node scripts/migrate/export-firestore.js [--out migrate-export.json]
 *
 * Không commit file service account / export có dữ liệu thật.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

var require = createRequire(import.meta.url);

function arg(name, fallback) {
  var i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

async function main() {
  var saPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!saPath || !fs.existsSync(saPath)) {
    console.error(
      "Thiếu service account. Đặt GOOGLE_APPLICATION_CREDENTIALS hoặc FIREBASE_SERVICE_ACCOUNT_PATH."
    );
    console.error("Tải JSON từ Firebase Console → Project settings → Service accounts.");
    process.exit(1);
  }

  var admin;
  try {
    admin = require("firebase-admin");
  } catch (_) {
    console.error("Cần cài firebase-admin: npm install firebase-admin --no-save");
    process.exit(1);
  }

  var sa = JSON.parse(fs.readFileSync(saPath, "utf8"));
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      storageBucket: sa.project_id + ".appspot.com",
    });
  }
  var db = admin.firestore();
  var auth = admin.auth();

  console.log("Đang liệt kê Auth users...");
  var users = [];
  var nextPageToken;
  do {
    var page = await auth.listUsers(1000, nextPageToken);
    page.users.forEach(function (u) {
      users.push({
        uid: u.uid,
        email: u.email || null,
        displayName: u.displayName || null,
        disabled: !!u.disabled,
        customClaims: u.customClaims || null,
      });
    });
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  console.log("Đang export Firestore (recursive collections)...");
  var documents = [];

  async function walk(colRef, prefix) {
    var snap = await colRef.get();
    for (var i = 0; i < snap.docs.length; i++) {
      var doc = snap.docs[i];
      var p = prefix ? prefix + "/" + doc.id : colRef.id + "/" + doc.id;
      // When walking from root, colRef.id is the collection id
      var fullPath = colRef.path ? colRef.path + "/" + doc.id : p;
      if (!colRef.path) fullPath = colRef.id + "/" + doc.id;
      else fullPath = colRef.path + "/" + doc.id;
      documents.push({ path: fullPath, data: doc.data() });
      var subs = await doc.ref.listCollections();
      for (var j = 0; j < subs.length; j++) {
        await walk(subs[j], fullPath);
      }
    }
  }

  var roots = await db.listCollections();
  for (var r = 0; r < roots.length; r++) {
    await walk(roots[r], "");
  }

  var outPath = path.resolve(arg("--out", "migrate-export.json"));
  var payload = {
    exportedAt: new Date().toISOString(),
    projectId: sa.project_id,
    users: users,
    documents: documents,
    note: "Passwords không export được — import sẽ đặt 123456 + forcePasswordChange.",
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log("Wrote " + outPath);
  console.log("users=" + users.length + " documents=" + documents.length);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
