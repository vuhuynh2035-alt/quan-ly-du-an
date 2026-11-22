/**
 * Import migrate-export.json vào SQLite selfhost.
 * Mọi user: password = 123456, force_password_change = 1.
 *
 * Chạy (từ gốc repo hoặc server/):
 *   node scripts/migrate/import-sqlite.js --in migrate-export.json --db server/data/app.sqlite
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { DatabaseSync } from "node:sqlite";

var __dirname = path.dirname(fileURLToPath(import.meta.url));
var serverRequire = createRequire(
  path.resolve(__dirname, "../../server/package.json")
);
var bcrypt = serverRequire("bcryptjs");

function arg(name, fallback) {
  var i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function ensureSchema(db) {
  var schemaPath = path.resolve(__dirname, "../../server/src/schema.sql");
  db.exec(fs.readFileSync(schemaPath, "utf8"));
}

function usernameFromUser(u) {
  if (u.displayName) return String(u.displayName).trim().toLowerCase();
  if (u.email) return String(u.email).split("@")[0].toLowerCase();
  return String(u.uid).slice(0, 12);
}

function main() {
  var inPath = path.resolve(arg("--in", "migrate-export.json"));
  var dbPath = path.resolve(arg("--db", "server/data/app.sqlite"));
  var defaultPass = arg("--password", process.env.DEFAULT_PASSWORD || "123456");

  if (!fs.existsSync(inPath)) {
    console.error("Không thấy file export: " + inPath);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  var payload = JSON.parse(fs.readFileSync(inPath, "utf8"));
  var db = new DatabaseSync(dbPath);
  ensureSchema(db);

  var hash = bcrypt.hashSync(defaultPass, 10);
  var t = nowIso();
  var insertUser = db.prepare(
    `INSERT OR REPLACE INTO users
      (id, username, email, password_hash, display_name, role, org_id, emp_id, force_password_change, profile_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
  );

  var userDocs = {};
  (payload.documents || []).forEach(function (d) {
    if (d.path && d.path.indexOf("users/") === 0 && d.path.split("/").length === 2) {
      userDocs[d.path.split("/")[1]] = d.data || {};
    }
  });

  var usedNames = new Set();
  db.exec("BEGIN");
  try {
    (payload.users || []).forEach(function (u) {
      var profile = userDocs[u.uid] || {};
      var username = String(profile.username || usernameFromUser(u))
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "");
      if (!username) username = "user-" + u.uid.slice(0, 8);
      var base = username;
      var n = 2;
      while (usedNames.has(username)) {
        username = base + n;
        n++;
      }
      usedNames.add(username);
      insertUser.run(
        u.uid,
        username,
        u.email || username + "@selfhost.local",
        hash,
        profile.displayName || u.displayName || username,
        profile.role || "employee",
        profile.orgId || "cong-trinh",
        profile.empId || null,
        JSON.stringify(profile),
        t,
        t
      );
    });
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch (_) {}
    throw err;
  }

  var upsertWs = db.prepare(
    "INSERT INTO workspaces (org_id, data_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(org_id) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at"
  );
  var upsertDoc = db.prepare(
    "INSERT INTO documents (path, data_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at"
  );

  function insertTyped(table, orgId, id, data) {
    if (table === "employees" || table === "customers") {
      db.prepare(
        "INSERT INTO " +
          table +
          " (id, org_id, data_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at, org_id=excluded.org_id"
      ).run(id, orgId, JSON.stringify(data || {}), t);
    } else {
      db.prepare(
        "INSERT INTO " +
          table +
          " (id, org_id, data_json, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json, org_id=excluded.org_id"
      ).run(id, orgId, JSON.stringify(data || {}), t);
    }
  }

  var COL = {
    messages: "messages",
    leaveRequests: "leave_requests",
    reports: "reports",
    attendance: "attendance",
    arrivals: "arrivals",
    employees: "employees",
    customers: "customers",
  };

  db.exec("BEGIN");
  try {
    (payload.documents || []).forEach(function (d) {
      var parts = String(d.path || "").split("/").filter(Boolean);
      if (parts[0] === "users" && parts.length === 2) return;
      if (parts[0] === "workspaces" && parts[2] === "data" && parts[3] === "main") {
        upsertWs.run(parts[1], JSON.stringify(d.data || {}), t);
        return;
      }
      if (parts[0] === "workspaces" && parts.length === 4 && COL[parts[2]]) {
        insertTyped(COL[parts[2]], parts[1], parts[3], d.data);
        return;
      }
      upsertDoc.run(d.path, JSON.stringify(d.data || {}), t);
    });
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch (_) {}
    throw err;
  }

  // Bảo đảm workspace mặc định
  upsertWs.run("cong-trinh", (db.prepare("SELECT data_json FROM workspaces WHERE org_id=?").get("cong-trinh") || { data_json: "{}" }).data_json || "{}", t);
  upsertWs.run("nha-may", (db.prepare("SELECT data_json FROM workspaces WHERE org_id=?").get("nha-may") || { data_json: "{}" }).data_json || "{}", t);

  console.log("Import xong → " + dbPath);
  console.log(
    "users=" +
      db.prepare("SELECT COUNT(*) n FROM users").get().n +
      " workspaces=" +
      db.prepare("SELECT COUNT(*) n FROM workspaces").get().n +
      " documents=" +
      db.prepare("SELECT COUNT(*) n FROM documents").get().n
  );
  console.log("Mật khẩu tất cả user = " + defaultPass + " (force change = 1)");
  db.close();
}

main();
