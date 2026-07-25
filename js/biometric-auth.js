/**
 * Đăng nhập sinh trắc học (vân tay / khuôn mặt / Windows Hello)
 * dùng WebAuthn platform authenticator + lưu credential đã mã hóa trên máy.
 */

var STORAGE_KEY = "cv3_bio_v1";
var IDB_NAME = "cv3-bio";
var IDB_STORE = "keys";
var IDB_KEY = "aes";

function bufToB64(buf) {
  var bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  var s = "";
  for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBuf(b64) {
  var s = atob(b64);
  var bytes = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

function toB64Url(buf) {
  return bufToB64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(str) {
  var s = String(str || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return b64ToBuf(s);
}

function randomBytes(n) {
  var buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

function uidToBytes(uid) {
  var s = String(uid || "");
  var enc = new TextEncoder();
  var bytes = enc.encode(s);
  if (bytes.length >= 16) return bytes.slice(0, 64);
  var out = new Uint8Array(16);
  out.set(bytes);
  return out;
}

function openIdb() {
  return new Promise(function (resolve, reject) {
    if (!window.indexedDB) {
      reject(new Error("Thiết bị không hỗ trợ lưu khóa an toàn."));
      return;
    }
    var req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = function () {
      var db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = function () {
      resolve(req.result);
    };
    req.onerror = function () {
      reject(req.error || new Error("Không mở được IndexedDB."));
    };
  });
}

async function idbGet(key) {
  var db = await openIdb();
  return new Promise(function (resolve, reject) {
    var tx = db.transaction(IDB_STORE, "readonly");
    var req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = function () {
      resolve(req.result);
    };
    req.onerror = function () {
      reject(req.error);
    };
  });
}

async function idbSet(key, value) {
  var db = await openIdb();
  return new Promise(function (resolve, reject) {
    var tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = function () {
      resolve();
    };
    tx.onerror = function () {
      reject(tx.error);
    };
  });
}

async function idbDel(key) {
  var db = await openIdb();
  return new Promise(function (resolve, reject) {
    var tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = function () {
      resolve();
    };
    tx.onerror = function () {
      reject(tx.error);
    };
  });
}

function readMeta() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    var data = JSON.parse(raw);
    if (!data || !data.credentialId || !data.username || !data.cipher || !data.iv) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function writeMeta(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function clearMeta() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
}

async function getOrCreateAesKey() {
  var existing = await idbGet(IDB_KEY);
  if (existing && existing instanceof CryptoKey) return existing;
  if (existing && typeof existing === "string") {
    var raw = b64ToBuf(existing);
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  }
  var key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  var exported = await crypto.subtle.exportKey("raw", key);
  await idbSet(IDB_KEY, bufToB64(exported));
  return crypto.subtle.importKey("raw", exported, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptPassword(password) {
  var key = await getOrCreateAesKey();
  var iv = randomBytes(12);
  var cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    new TextEncoder().encode(String(password || ""))
  );
  return { cipher: bufToB64(cipher), iv: bufToB64(iv) };
}

async function decryptPassword(meta) {
  var key = await getOrCreateAesKey();
  var plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(b64ToBuf(meta.iv)) },
    key,
    b64ToBuf(meta.cipher)
  );
  return new TextDecoder().decode(plain);
}

export function isSecureContextOk() {
  return !!(window.isSecureContext || location.protocol === "https:" || location.hostname === "localhost");
}

export async function isBiometricAvailable() {
  if (!isSecureContextOk()) return false;
  if (!window.PublicKeyCredential) return false;
  if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function") {
    return false;
  }
  try {
    return !!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch (e) {
    return false;
  }
}

export function isBiometricEnabled() {
  return !!readMeta();
}

export function getBiometricMeta() {
  return readMeta();
}

export async function getBiometricStatus() {
  var available = await isBiometricAvailable();
  var meta = readMeta();
  return {
    available: available,
    enabled: !!meta,
    username: meta ? meta.username : "",
    uid: meta ? meta.uid || "" : "",
  };
}

function webauthnErrMsg(err) {
  var name = (err && err.name) || "";
  if (name === "NotAllowedError") return "Đã hủy hoặc hết thời gian xác thực sinh trắc học.";
  if (name === "InvalidStateError") return "Sinh trắc học đã được đăng ký trên thiết bị này.";
  if (name === "NotSupportedError") return "Thiết bị không hỗ trợ vân tay / khuôn mặt.";
  if (name === "SecurityError") return "Cần mở app qua HTTPS để dùng sinh trắc học.";
  if (name === "AbortError") return "Đã hủy xác thực sinh trắc học.";
  return (err && err.message) || "Không xác thực được sinh trắc học.";
}

export async function enableBiometric(opts) {
  opts = opts || {};
  var username = String(opts.username || "").trim();
  var password = String(opts.password || "");
  var uid = String(opts.uid || "");
  var displayName = String(opts.displayName || username || "Người dùng");
  if (!username || password.length < 6) {
    throw new Error("Cần tên đăng nhập và mật khẩu (≥6 ký tự) để bật sinh trắc học.");
  }
  if (!(await isBiometricAvailable())) {
    throw new Error("Thiết bị không hỗ trợ đăng nhập bằng vân tay / khuôn mặt.");
  }

  var challenge = randomBytes(32);
  var credId = null;
  try {
    var cred = await navigator.credentials.create({
      publicKey: {
        challenge: challenge,
        rp: {
          name: "Quản lý công việc",
          id: location.hostname,
        },
        user: {
          id: uidToBytes(uid || username),
          name: username,
          displayName: displayName,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 90000,
        attestation: "none",
      },
    });
    if (cred && cred.rawId) credId = toB64Url(cred.rawId);
  } catch (createErr) {
    if (!createErr || createErr.name !== "InvalidStateError") throw createErr;
    // Credential đã tồn tại trên thiết bị — xác thực lại để lấy credentialId.
    var assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        rpId: location.hostname,
        userVerification: "required",
        timeout: 90000,
      },
    });
    if (assertion && assertion.rawId) credId = toB64Url(assertion.rawId);
  }

  if (!credId) {
    throw new Error("Không tạo được thông tin sinh trắc học.");
  }

  var enc = await encryptPassword(password);
  writeMeta({
    uid: uid,
    username: username,
    credentialId: credId,
    cipher: enc.cipher,
    iv: enc.iv,
    createdAt: Date.now(),
  });
  return getBiometricStatus();
}

export async function updateBiometricPassword(password, username) {
  var meta = readMeta();
  if (!meta) return null;
  if (String(password || "").length < 6) {
    throw new Error("Mật khẩu cần ít nhất 6 ký tự.");
  }
  var enc = await encryptPassword(password);
  meta.cipher = enc.cipher;
  meta.iv = enc.iv;
  if (username) meta.username = String(username).trim();
  meta.updatedAt = Date.now();
  writeMeta(meta);
  return getBiometricStatus();
}

export async function updateBiometricUsername(username) {
  var meta = readMeta();
  if (!meta) return null;
  meta.username = String(username || "").trim();
  meta.updatedAt = Date.now();
  writeMeta(meta);
  return getBiometricStatus();
}

export async function disableBiometric() {
  clearMeta();
  try {
    await idbDel(IDB_KEY);
  } catch (e) {}
  return getBiometricStatus();
}

export async function authenticateBiometric() {
  var meta = readMeta();
  if (!meta) throw new Error("Chưa bật đăng nhập sinh trắc học trên máy này.");
  if (!(await isBiometricAvailable())) {
    throw new Error("Thiết bị không hỗ trợ hoặc đã tắt sinh trắc học.");
  }

  var assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [
        {
          type: "public-key",
          id: fromB64Url(meta.credentialId),
          transports: ["internal"],
        },
      ],
      userVerification: "required",
      timeout: 90000,
      rpId: location.hostname,
    },
  });

  if (!assertion) {
    throw new Error("Xác thực sinh trắc học thất bại.");
  }

  var password;
  try {
    password = await decryptPassword(meta);
  } catch (e) {
    await disableBiometric();
    throw new Error("Dữ liệu sinh trắc học bị lỗi — hãy đăng nhập bằng mật khẩu và bật lại.");
  }
  return {
    username: meta.username,
    password: password,
    uid: meta.uid || "",
  };
}

export function formatBiometricError(err) {
  return webauthnErrMsg(err);
}
