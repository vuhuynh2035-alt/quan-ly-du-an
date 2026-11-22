import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

var db = null;

export function getDb() {
  if (!db) throw new Error("DB not initialized");
  return db;
}

export function nowIso() {
  return new Date().toISOString();
}

export function initDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, "uploads"), { recursive: true });
  var dbPath = path.join(dataDir, "app.sqlite");
  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  var schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  db.exec(schema);
  seedAdminIfNeeded();
  return db;
}

function seedAdminIfNeeded() {
  var count = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (count > 0) return;
  var username = String(process.env.ADMIN_USERNAME || "giamdoc").trim().toLowerCase();
  var password = String(process.env.ADMIN_PASSWORD || process.env.DEFAULT_PASSWORD || "123456");
  var id = uuidv4();
  var t = nowIso();
  db.prepare(
    `INSERT INTO users (id, username, email, password_hash, display_name, role, org_id, force_password_change, profile_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, '{}', ?, ?)`
  ).run(
    id,
    username,
    username + "@selfhost.local",
    bcrypt.hashSync(password, 10),
    username,
    "director",
    "cong-trinh",
    t,
    t
  );
  ensureWorkspace("cong-trinh");
  ensureWorkspace("nha-may");
}

export function ensureWorkspace(orgId) {
  var row = db.prepare("SELECT org_id FROM workspaces WHERE org_id = ?").get(orgId);
  if (row) return;
  db.prepare(
    "INSERT INTO workspaces (org_id, data_json, updated_at) VALUES (?, '{}', ?)"
  ).run(orgId, nowIso());
}

export function userPublic(row) {
  if (!row) return null;
  var profile = {};
  try {
    profile = JSON.parse(row.profile_json || "{}");
  } catch (_) {}
  return {
    uid: row.id,
    id: row.id,
    username: row.username,
    email: row.email || row.username + "@selfhost.local",
    displayName: row.display_name || row.username,
    role: row.role,
    orgId: row.org_id,
    empId: row.emp_id,
    forcePasswordChange: !!row.force_password_change,
    profile: profile,
  };
}

export function findUserByUsername(username) {
  return db
    .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
    .get(String(username || "").trim());
}

export function findUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function resetAllPasswords(defaultPassword) {
  var hash = bcrypt.hashSync(defaultPassword || "123456", 10);
  var t = nowIso();
  var info = db
    .prepare(
      "UPDATE users SET password_hash = ?, force_password_change = 1, updated_at = ?"
    )
    .run(hash, t);
  return info.changes;
}
