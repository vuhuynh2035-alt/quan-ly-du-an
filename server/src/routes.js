import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import {
  requireAuth,
  optionalAuth,
  login,
  changePassword,
  setCookie,
  clearCookie,
} from "./auth.js";
import * as dataApi from "./data.js";
import { notifyDocChange } from "./ws.js";
import { resetAllPasswords, getDb, nowIso, findUserById, userPublic } from "./db.js";

var upload = multer({
  storage: multer.diskStorage({
    destination: function (_req, _file, cb) {
      var dir = path.join(process.env.DATA_DIR || "./data", "uploads");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: function (_req, file, cb) {
      var ext = path.extname(file.originalname || "") || "";
      cb(null, uuidv4() + ext);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

var NOT_PORTED = [
  "ackAssignment",
  "submitAttendance",
  "confirmArrival",
  "submitDailyReport",
  "completeMyAssignment",
  "completeProject",
  "hasDirectorInOrg",
  "claimDirectorRole",
  "provisionEmployee",
  "provisionAllEmployees",
  "updateMyProfile",
  "updateMyUsername",
  "setEmpOrgMembership",
  "migrateSharedCustomers",
  "migrateDualOrgs",
  "exportCompanyBackup",
  "restoreCompanyBackup",
  "syncFcmToken",
  "changeMyPassword",
];

export function createRouter() {
  var router = express.Router();

  router.get("/health", function (_req, res) {
    res.json({
      ok: true,
      service: "quan-ly-du-an-selfhost",
      time: new Date().toISOString(),
    });
  });

  router.get("/config", function (_req, res) {
    res.json({
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
      forcePasswordChangeSupported: true,
      callablesPorted: ["changeMyPassword"],
      callablesPending: NOT_PORTED.filter(function (n) {
        return n !== "changeMyPassword";
      }),
    });
  });

  router.post("/auth/login", function (req, res) {
    try {
      var username = (req.body && (req.body.username || req.body.email)) || "";
      if (String(username).includes("@")) {
        username = String(username).split("@")[0];
      }
      var result = login(username, req.body && req.body.password);
      setCookie(res, result.token);
      res.json({
        token: result.token,
        user: result.user,
        forcePasswordChange: !!result.user.forcePasswordChange,
      });
    } catch (err) {
      res.status(401).json({
        error: err.code || "auth/invalid-credential",
        message: err.message || "Đăng nhập thất bại.",
      });
    }
  });

  router.post("/auth/logout", function (_req, res) {
    clearCookie(res);
    res.json({ ok: true });
  });

  router.get("/auth/me", requireAuth, function (req, res) {
    res.json({ user: req.user });
  });

  router.post("/auth/change-password", requireAuth, function (req, res) {
    try {
      var user = changePassword(
        req.userRow,
        req.body && req.body.currentPassword,
        req.body && req.body.newPassword
      );
      res.json({ user: user });
    } catch (err) {
      res.status(400).json({
        error: err.code || "auth/error",
        message: err.message,
      });
    }
  });

  router.get("/data/doc", requireAuth, function (req, res) {
    try {
      var pathArg = req.query.path;
      if (!pathArg) return res.status(400).json({ error: "missing-path" });
      res.json(dataApi.getDoc(String(pathArg)));
    } catch (err) {
      res.status(400).json({ error: err.code || "error", message: err.message });
    }
  });

  router.put("/data/doc", requireAuth, function (req, res) {
    try {
      var pathArg = req.body && req.body.path;
      if (!pathArg) return res.status(400).json({ error: "missing-path" });
      dataApi.setDoc(pathArg, req.body.data, req.body.options, req.user.id);
      notifyDocChange(pathArg, req.body.data);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.code || "error", message: err.message });
    }
  });

  router.patch("/data/doc", requireAuth, function (req, res) {
    try {
      var pathArg = req.body && req.body.path;
      if (!pathArg) return res.status(400).json({ error: "missing-path" });
      dataApi.updateDoc(pathArg, req.body.data || req.body.patch, req.user.id);
      notifyDocChange(pathArg, req.body.data || req.body.patch);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.code || "error", message: err.message });
    }
  });

  router.delete("/data/doc", requireAuth, function (req, res) {
    try {
      var pathArg = req.query.path || (req.body && req.body.path);
      if (!pathArg) return res.status(400).json({ error: "missing-path" });
      dataApi.deleteDoc(String(pathArg));
      notifyDocChange(String(pathArg), null);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.code || "error", message: err.message });
    }
  });

  router.post("/data/add", requireAuth, function (req, res) {
    try {
      var col = req.body && req.body.collection;
      if (!col) return res.status(400).json({ error: "missing-collection" });
      var result = dataApi.addDoc(col, req.body.data);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.code || "error", message: err.message });
    }
  });

  router.post("/data/query", requireAuth, function (req, res) {
    try {
      var col = req.body && req.body.collection;
      if (!col) return res.status(400).json({ error: "missing-collection" });
      res.json({ docs: dataApi.getQuery(col, req.body.spec) });
    } catch (err) {
      res.status(400).json({ error: err.code || "error", message: err.message });
    }
  });

  router.post("/data/batchSet", requireAuth, function (req, res) {
    try {
      dataApi.batchSet(req.body && req.body.ops, req.body && req.body.options, req.user.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.code || "error", message: err.message });
    }
  });

  router.post("/callable/:name", requireAuth, function (req, res) {
    var name = req.params.name;
    if (name === "changeMyPassword") {
      try {
        var user = changePassword(
          req.userRow,
          req.body && req.body.currentPassword,
          req.body && (req.body.newPassword || req.body.password)
        );
        return res.json({ data: { user: user } });
      } catch (err) {
        return res.status(400).json({
          error: err.code || "auth/error",
          message: err.message,
        });
      }
    }
    res.status(501).json({
      error: "not-ported",
      message:
        "Callable «" +
        name +
        "» chưa chuyển sang selfhost. Dùng APP_BACKEND=firebase hoặc chờ Phase 2 tiếp.",
      name: name,
    });
  });

  router.post("/storage/upload", requireAuth, upload.single("file"), function (req, res) {
    if (!req.file) return res.status(400).json({ error: "missing-file" });
    var rel = "/uploads/" + req.file.filename;
    res.json({
      url: rel,
      path: req.body && req.body.path ? req.body.path : rel,
    });
  });

  router.post("/push/subscribe", requireAuth, function (req, res) {
    var sub = req.body && req.body.subscription;
    if (!sub || !sub.endpoint) {
      return res.status(400).json({ error: "missing-subscription" });
    }
    var db = getDb();
    var t = nowIso();
    var existing = db
      .prepare("SELECT id FROM push_subscriptions WHERE endpoint = ?")
      .get(sub.endpoint);
    if (existing) {
      db.prepare(
        "UPDATE push_subscriptions SET user_id = ?, data_json = ?, created_at = ? WHERE id = ?"
      ).run(req.user.id, JSON.stringify(sub), t, existing.id);
      return res.json({ ok: true, id: existing.id });
    }
    var id = uuidv4();
    db.prepare(
      "INSERT INTO push_subscriptions (id, user_id, endpoint, data_json, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(id, req.user.id, sub.endpoint, JSON.stringify(sub), t);
    res.json({ ok: true, id: id });
  });

  // Admin helper — chỉ dùng khi migrate / reset mật khẩu
  router.post("/admin/reset-passwords", requireAuth, function (req, res) {
    if (req.user.role !== "director" && req.user.role !== "admin") {
      return res.status(403).json({ error: "permission-denied" });
    }
    var n = resetAllPasswords(
      (req.body && req.body.password) || process.env.DEFAULT_PASSWORD || "123456"
    );
    res.json({ ok: true, updated: n });
  });

  router.get("/admin/user/:id", requireAuth, function (req, res) {
    if (req.user.role !== "director" && req.user.role !== "admin") {
      return res.status(403).json({ error: "permission-denied" });
    }
    res.json({ user: userPublic(findUserById(req.params.id)) });
  });

  return router;
}

export { optionalAuth };
