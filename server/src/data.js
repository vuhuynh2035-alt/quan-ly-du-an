import { v4 as uuidv4 } from "uuid";
import {
  getDb,
  nowIso,
  ensureWorkspace,
  findUserById,
  userPublic,
} from "./db.js";
import { classifyDocPath, classifyCollectionPath } from "./paths.js";

function parseJson(s, fallback) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return fallback;
  }
}

function matchWhere(obj, where) {
  if (!where || !where.length) return true;
  for (var i = 0; i < where.length; i++) {
    var w = where[i];
    var field = w[0];
    var op = w[1];
    var val = w[2];
    var cur = obj[field];
    if (op === "==" || op === "===") {
      if (cur !== val) return false;
    } else if (op === "!=") {
      if (cur === val) return false;
    } else if (op === "in") {
      if (!Array.isArray(val) || val.indexOf(cur) < 0) return false;
    } else if (op === "array-contains") {
      if (!Array.isArray(cur) || cur.indexOf(val) < 0) return false;
    } else {
      return false;
    }
  }
  return true;
}

export function getDoc(path) {
  var info = classifyDocPath(path);
  var db = getDb();

  if (info.kind === "user") {
    var u = findUserById(info.userId);
    if (!u) return { id: info.userId, exists: false, data: undefined };
    var pub = userPublic(u);
    return {
      id: u.id,
      exists: true,
      data: Object.assign({}, pub.profile, {
        username: pub.username,
        displayName: pub.displayName,
        role: pub.role,
        orgId: pub.orgId,
        empId: pub.empId,
        forcePasswordChange: pub.forcePasswordChange,
      }),
    };
  }

  if (info.kind === "workspace_main") {
    ensureWorkspace(info.orgId);
    var ws = db.prepare("SELECT * FROM workspaces WHERE org_id = ?").get(info.orgId);
    return {
      id: "main",
      exists: true,
      data: parseJson(ws.data_json, {}),
    };
  }

  if (info.kind === "collection_doc") {
    var row = db
      .prepare("SELECT * FROM " + info.table + " WHERE id = ? AND org_id = ?")
      .get(info.docId, info.orgId);
    if (!row) return { id: info.docId, exists: false, data: undefined };
    return { id: row.id, exists: true, data: parseJson(row.data_json, {}) };
  }

  if (info.kind === "document") {
    var d = db.prepare("SELECT * FROM documents WHERE path = ?").get(info.path);
    if (!d) return { id: info.parts[info.parts.length - 1], exists: false, data: undefined };
    return {
      id: info.parts[info.parts.length - 1],
      exists: true,
      data: parseJson(d.data_json, {}),
    };
  }

  return { id: "", exists: false, data: undefined };
}

export function setDoc(path, value, options, userId) {
  var info = classifyDocPath(path);
  var db = getDb();
  var t = nowIso();
  var merge = !!(options && options.merge);
  var data = value && typeof value === "object" ? value : {};

  if (info.kind === "user") {
    var existing = findUserById(info.userId);
    if (!existing) {
      var err = new Error("User not found: " + info.userId);
      err.code = "not-found";
      throw err;
    }
    var profile = parseJson(existing.profile_json, {});
    var next = merge ? Object.assign({}, profile, data) : data;
    var displayName = data.displayName != null ? data.displayName : existing.display_name;
    var role = data.role != null ? data.role : existing.role;
    var orgId = data.orgId != null ? data.orgId : existing.org_id;
    var empId = data.empId != null ? data.empId : existing.emp_id;
    db.prepare(
      `UPDATE users SET profile_json = ?, display_name = ?, role = ?, org_id = ?, emp_id = ?, updated_at = ? WHERE id = ?`
    ).run(
      JSON.stringify(next),
      displayName,
      role,
      orgId,
      empId,
      t,
      info.userId
    );
    return;
  }

  if (info.kind === "workspace_main") {
    ensureWorkspace(info.orgId);
    var ws = db.prepare("SELECT data_json FROM workspaces WHERE org_id = ?").get(info.orgId);
    var cur = parseJson(ws.data_json, {});
    var nextWs = merge ? Object.assign({}, cur, data) : data;
    db.prepare(
      "UPDATE workspaces SET data_json = ?, updated_at = ?, updated_by = ? WHERE org_id = ?"
    ).run(JSON.stringify(nextWs), t, userId || null, info.orgId);
    return;
  }

  if (info.kind === "collection_doc") {
    var prev = db
      .prepare("SELECT data_json FROM " + info.table + " WHERE id = ? AND org_id = ?")
      .get(info.docId, info.orgId);
    var nextDoc = data;
    if (merge && prev) nextDoc = Object.assign({}, parseJson(prev.data_json, {}), data);
    if (prev) {
      if (info.table === "employees" || info.table === "customers") {
        db.prepare(
          "UPDATE " + info.table + " SET data_json = ?, updated_at = ? WHERE id = ? AND org_id = ?"
        ).run(JSON.stringify(nextDoc), t, info.docId, info.orgId);
      } else {
        db.prepare(
          "UPDATE " + info.table + " SET data_json = ? WHERE id = ? AND org_id = ?"
        ).run(JSON.stringify(nextDoc), info.docId, info.orgId);
      }
    } else {
      insertCollectionRow(info.table, info.orgId, info.docId, nextDoc, t);
    }
    return;
  }

  if (info.kind === "document") {
    var dprev = db.prepare("SELECT data_json FROM documents WHERE path = ?").get(info.path);
    var nextD = data;
    if (merge && dprev) nextD = Object.assign({}, parseJson(dprev.data_json, {}), data);
    if (dprev) {
      db.prepare(
        "UPDATE documents SET data_json = ?, updated_at = ?, updated_by = ? WHERE path = ?"
      ).run(JSON.stringify(nextD), t, userId || null, info.path);
    } else {
      db.prepare(
        "INSERT INTO documents (path, data_json, updated_at, updated_by) VALUES (?, ?, ?, ?)"
      ).run(info.path, JSON.stringify(nextD), t, userId || null);
    }
    return;
  }

  var err2 = new Error("Unsupported path: " + path);
  err2.code = "invalid-argument";
  throw err2;
}

function insertCollectionRow(table, orgId, id, data, t) {
  var db = getDb();
  if (table === "employees" || table === "customers") {
    db.prepare(
      "INSERT INTO " + table + " (id, org_id, data_json, updated_at) VALUES (?, ?, ?, ?)"
    ).run(id, orgId, JSON.stringify(data), t);
  } else {
    db.prepare(
      "INSERT INTO " + table + " (id, org_id, data_json, created_at) VALUES (?, ?, ?, ?)"
    ).run(id, orgId, JSON.stringify(data), t);
  }
}

export function updateDoc(path, patch, userId) {
  return setDoc(path, patch, { merge: true }, userId);
}

export function deleteDoc(path) {
  var info = classifyDocPath(path);
  var db = getDb();
  if (info.kind === "collection_doc") {
    db.prepare("DELETE FROM " + info.table + " WHERE id = ? AND org_id = ?").run(
      info.docId,
      info.orgId
    );
    return;
  }
  if (info.kind === "document") {
    db.prepare("DELETE FROM documents WHERE path = ?").run(info.path);
    return;
  }
  var err = new Error("Cannot delete path: " + path);
  err.code = "invalid-argument";
  throw err;
}

export function addDoc(colPath, value) {
  var info = classifyCollectionPath(colPath);
  var t = nowIso();
  var id = uuidv4();
  var data = value && typeof value === "object" ? value : {};
  if (info.kind === "collection") {
    insertCollectionRow(info.table, info.orgId, id, data, t);
    return { id: id };
  }
  var path = (info.prefix ? info.prefix + "/" : "") + id;
  getDb()
    .prepare(
      "INSERT INTO documents (path, data_json, updated_at) VALUES (?, ?, ?)"
    )
    .run(path, JSON.stringify(data), t);
  return { id: id };
}

export function getQuery(colPath, spec) {
  var info = classifyCollectionPath(colPath);
  var db = getDb();
  var rows = [];

  if (info.kind === "collection") {
    rows = db
      .prepare("SELECT id, data_json FROM " + info.table + " WHERE org_id = ?")
      .all(info.orgId)
      .map(function (r) {
        return { id: r.id, data: parseJson(r.data_json, {}) };
      });
  } else if (info.kind === "users") {
    rows = db
      .prepare("SELECT * FROM users")
      .all()
      .map(function (u) {
        var pub = userPublic(u);
        return {
          id: u.id,
          data: Object.assign({}, pub.profile, {
            username: pub.username,
            displayName: pub.displayName,
            role: pub.role,
            orgId: pub.orgId,
            empId: pub.empId,
            forcePasswordChange: pub.forcePasswordChange,
          }),
        };
      });
  } else {
    var prefix = info.prefix || "";
    rows = db
      .prepare("SELECT path, data_json FROM documents WHERE path LIKE ?")
      .all(prefix + "/%")
      .map(function (r) {
        var id = r.path.slice(prefix.length + 1).split("/")[0];
        return { id: id, data: parseJson(r.data_json, {}) };
      });
  }

  if (spec && spec.where) {
    rows = rows.filter(function (r) {
      return matchWhere(r.data, spec.where);
    });
  }
  if (spec && spec.orderBy && spec.orderBy.length) {
    var ob = spec.orderBy[0];
    var field = ob[0];
    var dir = (ob[1] || "asc").toLowerCase() === "desc" ? -1 : 1;
    rows.sort(function (a, b) {
      var av = a.data[field];
      var bv = b.data[field];
      if (av == null && bv == null) return 0;
      if (av == null) return -1 * dir;
      if (bv == null) return 1 * dir;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }
  if (spec && spec.limit) rows = rows.slice(0, spec.limit);
  return rows;
}

export function batchSet(ops, options, userId) {
  var db = getDb();
  var list = ops || [];
  db.exec("BEGIN");
  try {
    for (var i = 0; i < list.length; i++) {
      setDoc(list[i].path, list[i].data, options, userId);
    }
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch (_) {}
    throw err;
  }
}
