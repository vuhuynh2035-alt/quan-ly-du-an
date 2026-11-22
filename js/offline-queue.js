/**
 * Hàng đợi offline cho chấm công (IndexedDB).
 * Mất mạng: lưu punch (kèm ảnh) trên máy; có mạng thì tự gửi lại theo thứ tự.
 * Server idempotent theo punchId nên gửi lại an toàn.
 */
var DB_NAME = "cv3-offline";
var STORE = "att";

function openDb() {
  return new Promise(function (resolve, reject) {
    if (typeof indexedDB === "undefined") return reject(new Error("no-idb"));
    var req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = function () {
      req.result.createObjectStore(STORE, { keyPath: "punchId" });
    };
    req.onsuccess = function () {
      resolve(req.result);
    };
    req.onerror = function () {
      reject(req.error);
    };
  });
}

function tx(mode, fn) {
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var t = db.transaction(STORE, mode);
      var store = t.objectStore(STORE);
      var out = fn(store);
      t.oncomplete = function () {
        db.close();
        resolve(out && out.result !== undefined ? out.result : undefined);
      };
      t.onerror = t.onabort = function () {
        db.close();
        reject(t.error);
      };
    });
  });
}

export function queueAttPut(item) {
  return tx("readwrite", function (s) {
    return s.put(item);
  });
}

export function queueAttDelete(punchId) {
  return tx("readwrite", function (s) {
    return s.delete(punchId);
  });
}

export function queueAttAll() {
  return tx("readonly", function (s) {
    return s.getAll();
  }).then(function (rows) {
    return (rows || []).sort(function (a, b) {
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  });
}

/** Lỗi do mạng/máy chủ tạm thời (đáng xếp hàng), khác lỗi nghiệp vụ (từ chối thật). */
export function isTransientError(err) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  var code = String((err && err.code) || "");
  var msg = String((err && err.message) || err || "");
  if (/unavailable|deadline-exceeded|retry-limit|network|internal$|unknown$/i.test(code)) return true;
  if (err && err.name === "TypeError") return true;
  return /failed to fetch|network|offline|timeout|timed out|load failed|ERR_/i.test(msg);
}
