import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  findUserById,
  findUserByUsername,
  nowIso,
  userPublic,
  getDb,
} from "./db.js";

export function jwtSecret() {
  var s = process.env.JWT_SECRET;
  if (!s || s === "change-me-to-a-long-random-string") {
    if (process.env.NODE_ENV === "production") {
      console.warn("[selfhost] JWT_SECRET chưa đặt — dùng secret tạm (chỉ dev/local).");
    }
    return "dev-only-jwt-secret-change-me";
  }
  return s;
}

export function cookieName() {
  return process.env.JWT_COOKIE_NAME || "duan_session";
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    jwtSecret(),
    { expiresIn: "30d" }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, jwtSecret());
  } catch (_) {
    return null;
  }
}

export function readTokenFromReq(req) {
  var auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  var cname = cookieName();
  if (req.cookies && req.cookies[cname]) return req.cookies[cname];
  return null;
}

export function requireAuth(req, res, next) {
  var token = readTokenFromReq(req);
  if (!token) {
    return res.status(401).json({ error: "unauthenticated", message: "Chưa đăng nhập." });
  }
  var payload = verifyToken(token);
  if (!payload || !payload.sub) {
    return res.status(401).json({ error: "unauthenticated", message: "Phiên hết hạn." });
  }
  var row = findUserById(payload.sub);
  if (!row) {
    return res.status(401).json({ error: "unauthenticated", message: "Tài khoản không tồn tại." });
  }
  req.user = userPublic(row);
  req.userRow = row;
  next();
}

export function optionalAuth(req, _res, next) {
  var token = readTokenFromReq(req);
  if (token) {
    var payload = verifyToken(token);
    if (payload && payload.sub) {
      var row = findUserById(payload.sub);
      if (row) {
        req.user = userPublic(row);
        req.userRow = row;
      }
    }
  }
  next();
}

export function login(username, password) {
  var row = findUserByUsername(username);
  if (!row) {
    var err = new Error("Sai tên đăng nhập hoặc mật khẩu.");
    err.code = "auth/invalid-credential";
    throw err;
  }
  if (!bcrypt.compareSync(String(password || ""), row.password_hash)) {
    var err2 = new Error("Sai tên đăng nhập hoặc mật khẩu.");
    err2.code = "auth/invalid-credential";
    throw err2;
  }
  return { user: userPublic(row), token: signToken(row) };
}

export function changePassword(userRow, currentPassword, newPassword) {
  var cur = String(currentPassword || "");
  var allowSkipCurrent = !!userRow.force_password_change && !cur;
  if (!allowSkipCurrent && !bcrypt.compareSync(cur, userRow.password_hash)) {
    var err = new Error("Mật khẩu hiện tại không đúng.");
    err.code = "auth/wrong-password";
    throw err;
  }
  var np = String(newPassword || "");
  if (np.length < 6) {
    var err2 = new Error("Mật khẩu mới phải từ 6 ký tự.");
    err2.code = "auth/weak-password";
    throw err2;
  }
  var db = getDb();
  var t = nowIso();
  db.prepare(
    "UPDATE users SET password_hash = ?, force_password_change = 0, updated_at = ? WHERE id = ?"
  ).run(bcrypt.hashSync(np, 10), t, userRow.id);
  return userPublic(findUserById(userRow.id));
}

export function setCookie(res, token) {
  res.cookie(cookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: String(process.env.COOKIE_SECURE || "").toLowerCase() === "true",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearCookie(res) {
  res.clearCookie(cookieName(), { path: "/" });
}
