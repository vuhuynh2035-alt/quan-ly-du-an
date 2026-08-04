import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  isBiometricAvailable,
  isBiometricEnabled,
  getBiometricStatus,
  enableBiometric,
  disableBiometric,
  authenticateBiometric,
  updateBiometricPassword,
  updateBiometricUsername,
  formatBiometricError,
} from "./biometric-auth.js";

var cfg = window.FIREBASE_CONFIG;
var vapidKey = window.FIREBASE_VAPID_KEY;
var ORG_ALIAS = { saree: "cong-trinh" };
var CHIEF_GROUP = "Chỉ huy trưởng";
var CHIEF_ORG_ID = "cong-trinh";
var DEFAULT_ORGS = [
  { id: "cong-trinh", label: "Công trình tỉnh" },
  { id: "nha-may", label: "Công trình HCM" },
];

function listOrgs() {
  var raw = window.FIREBASE_ORGS;
  if (Array.isArray(raw) && raw.length) {
    return raw
      .map(function (o) {
        return {
          id: normalizeOrgId(o.id || o),
          label: o.label || orgLabel(normalizeOrgId(o.id || o)),
        };
      })
      .filter(function (o) {
        return !!o.id;
      });
  }
  return DEFAULT_ORGS.slice();
}

function normalizeOrgId(id) {
  var o = String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  if (ORG_ALIAS[o]) return ORG_ALIAS[o];
  return o || "cong-trinh";
}

function orgLabel(id) {
  var nid = normalizeOrgId(id);
  var found = listOrgs().find(function (o) {
    return o.id === nid;
  });
  if (found) return found.label;
  if (nid === "cong-trinh") return "Công trình tỉnh";
  if (nid === "nha-may") return "Công trình HCM";
  return nid;
}

function allOrgIds() {
  return listOrgs().map(function (o) {
    return o.id;
  });
}

function otherOrgId(active) {
  var ids = allOrgIds();
  var cur = normalizeOrgId(active || orgId);
  for (var i = 0; i < ids.length; i++) {
    if (ids[i] !== cur) return ids[i];
  }
  return ids[0] || "nha-may";
}

function normalizeOrgIds(list, fallback) {
  var out = [];
  var src = Array.isArray(list) ? list : fallback ? [fallback] : [];
  src.forEach(function (x) {
    var n = normalizeOrgId(x);
    if (n && out.indexOf(n) < 0) out.push(n);
  });
  if (!out.length && fallback) out.push(normalizeOrgId(fallback));
  return out;
}

function forceChiefOrgIds(empGroup, orgIds, fallback) {
  if (String(empGroup || "").trim() === CHIEF_GROUP) return [CHIEF_ORG_ID];
  return normalizeOrgIds(orgIds, fallback);
}

function authAllowedOrgIds(a, fallback) {
  var authInfo = a || {};
  if (authInfo.role === "director") return allOrgIds();
  return forceChiefOrgIds(authInfo.empGroup, authInfo.orgIds, authInfo.orgId || fallback || orgId);
}

var defaultOrg = normalizeOrgId(window.FIREBASE_DEFAULT_ORG || "cong-trinh");

function isLocalDevHost() {
  var h = location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

function clearLocalServiceWorkers() {
  if (!isLocalDevHost() || !("serviceWorker" in navigator)) return Promise.resolve();
  return navigator.serviceWorker.getRegistrations().then(function (regs) {
    return Promise.all(regs.map(function (r) { return r.unregister(); }));
  }).catch(function () {});
}
var configured =
  cfg &&
  cfg.apiKey &&
  cfg.apiKey !== "YOUR_API_KEY" &&
  cfg.projectId &&
  cfg.projectId !== "YOUR_PROJECT_ID";

var app = null;
var auth = null;
var db = null;
var orgId = defaultOrg;
var unsubSnap = null;
var unsubOtherSnap = null;
var unsubEmpMaster = null;
var empMasterById = {};
var unsubCustMaster = null;
var custMasterById = {};
var custMasterReady = false;
var unsubChatBc = null;
var unsubChatDm = null;
var chatMsgsBc = [];
var chatMsgsDm = [];
var unsubReports = null;
var unsubReportsOther = null;
var unsubAttendance = null;
/** Live subscribe window for reports/attendance (days). Override: window.CV3_HISTORY_DAYS */
var HISTORY_WINDOW_DAYS = Math.max(
  7,
  Math.min(120, Number(window.CV3_HISTORY_DAYS) || 30)
);
var REPORTS_LIVE_LIMIT = 500;
var ATT_LIVE_LIMIT_DIR = 3000;
var ATT_LIVE_LIMIT_EMP = 500;
var ATT_RANGE_LIMIT = 5000;
var REPORTS_RANGE_LIMIT = 1000;
/** Cache keys for on-demand historical fetches (cleared on org switch / logout). */
var historyRangeCache = Object.create(null);
var liveHistorySince = "";
var pushReady = false;
var writeTimer = null;
var writing = false;
/** Promise của flushWrite đang chạy — để switchOrg chờ xong, không bỏ qua. */
var writePromise = null;
/** Có scheduleWrite trong lúc đang ghi → chạy lại 1 lần sau khi xong (không xếp hàng N vòng upsert). */
var writeQueued = false;
/** Trong lúc ghi master: cập nhật cache nhưng hoãn apply/render UI. */
var pendingMasterUi = false;
var remotePatch = 0;
var booted = false;
/** Sau đổi đội: snapshot workspace mới phải apply dù patch ≤ local. */
var forceWorkspaceApply = false;
/** Tăng mỗi lần đổi đội — bỏ snapshot/apply stale của đội cũ. */
var orgSwitchGen = 0;
var switchingToOrg = null;
var pendingSwitchOrg = null;
var MASTER_BATCH_LIMIT = 400;
var appCv3 = null;
var authEpoch = 0;
var lastAuthUid = null;
var authOverlayVisible = null;
var subsUid = null;
var provisionBusy = false;
var provisionDone = false;
var provisionRetryTimer = null;
var provisionRetryCount = 0;
var PROVISION_RETRY_MAX = 4;

function callableErrMsg(err, fallback) {
  if (!err) return fallback || "Lỗi không xác định";
  if (err.details) return String(err.details);
  var msg = String(err.message || "");
  if (msg && msg.indexOf("INTERNAL") < 0 && msg.indexOf("firebase") < 0) return msg;
  var code = String(err.code || "");
  if (code === "functions/permission-denied")
    return "Chỉ giám đốc mới được tạo tài khoản nhân viên.";
  if (code === "functions/unauthenticated") return "Cần đăng nhập cloud.";
  return fallback || msg || "Không tạo được tài khoản nhân viên.";
}

function mergeProvisionIntoApp(cv3, data) {
  if (!cv3 || !data) return;
  if (cv3.mergeProvisionResults) {
    cv3.mergeProvisionResults(data);
    return;
  }
  var results = data.results || [];
  if (!results.length || !cv3.S) return;
  var byId = {};
  results.forEach(function (r) {
    if (r.empId && r.uid) {
      byId[r.empId] = { authUid: r.uid, loginKey: r.loginKey || "" };
    }
  });
  cv3.S.emp = cv3.S.emp.map(function (e) {
    var u = byId[e.id];
    if (!u) return e;
    return Object.assign({}, e, {
      authUid: u.authUid,
      loginKey: u.loginKey || e.loginKey,
    });
  });
  if (cv3.render) cv3.render();
}

async function resolveAccount(username, org, forSignup) {
  var u = sanitizeUsername(username);
  var o = normalizeOrgId(org || orgId);
  var emps = [];
  Object.keys(empMasterById).forEach(function (id) {
    var e = empMasterById[id];
    if (e) emps.push(e);
  });
  if (!emps.length) {
    try {
      var snap = await getDoc(doc(db, "workspaces", o, "data", "main"));
      emps = snap.exists() ? snap.data().emp || [] : [];
    } catch (e) {
      emps = [];
    }
  }
  if (!emps.length && appCv3 && appCv3.S && appCv3.S.empAll && appCv3.S.empAll.length) {
    emps = appCv3.S.empAll;
  }
  if (!emps.length && appCv3 && appCv3.S && appCv3.S.emp && appCv3.S.emp.length) {
    emps = appCv3.S.emp;
  }
  function empKey(e) {
    return e.loginKey || sanitizeUsername(e.name);
  }
  var emp = emps.find(function (e) {
    return empKey(e) === u && e.accountRole !== "director";
  });
  if (emp) {
    var membership = normalizeOrgIds(emp.orgIds, o);
    if (membership.indexOf(o) < 0 && membership.length) {
      var errOrg = new Error(
        "Nhân viên «" + emp.name + "» không thuộc đội " + orgLabel(o) + "."
      );
      errOrg.code = "auth/wrong-org";
      throw errOrg;
    }
    if (forSignup && emp.authUid) {
      var err2 = new Error(
        "Nhân viên «" +
          emp.name +
          "» đã có tài khoản. Hãy đăng nhập hoặc liên hệ giám đốc."
      );
      err2.code = "auth/employee-taken";
      throw err2;
    }
    var role = emp.accountRole === "director" ? "director" : "employee";
    return {
      role: role,
      empId: role === "director" ? null : emp.id,
      username: u,
      empName: emp.name,
      orgIds: membership.length ? membership : [o],
      empGroup: emp.group || "",
    };
  }
  var err = new Error(
    "Tên «" +
      username +
      "» chưa có trong danh sách nhân sự. Hỏi giám đốc hoặc kiểm tra chính tả (không dấu)."
  );
  err.code = "auth/unknown-employee";
  throw err;
}

function authSame(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.uid === b.uid &&
    a.role === b.role &&
    a.empId === b.empId &&
    a.username === b.username &&
    a.displayName === b.displayName &&
    a.age === b.age &&
    a.empGroup === b.empGroup &&
    a.orgId === b.orgId &&
    String(a.orgIds || []) === String(b.orgIds || [])
  );
}

function publishAuth(authInfo) {
  if (authSame(window.__CV3_AUTH, authInfo)) return;
  window.__CV3_AUTH = authInfo;
  if (appCv3 && appCv3.setAuth) appCv3.setAuth(authInfo);
}

function chatColRef() {
  return collection(doc(db, "workspaces", orgId), "messages");
}

function dmThreadId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

function msgAtMs(m) {
  if (!m || !m.at) return 0;
  if (typeof m.at.toMillis === "function") return m.at.toMillis();
  if (typeof m.at === "number") return m.at;
  return 0;
}

var deliveredMsgIds = {};
var readMsgIds = {};
var ackAsgnIds = {};

function mergeChatMsgs() {
  var map = {};
  chatMsgsBc.concat(chatMsgsDm).forEach(function (m) {
    map[m.id] = m;
  });
  var all = Object.keys(map)
    .map(function (id) {
      return map[id];
    })
    .sort(function (a, b) {
      return msgAtMs(a) - msgAtMs(b);
    });
  if (appCv3 && appCv3.setChatMsgs) appCv3.setChatMsgs(all);
  autoMarkIncomingDelivered(all);
}

function isoNow() {
  return new Date().toISOString();
}

function msgDocRef(msgId) {
  return doc(db, "workspaces", orgId, "messages", msgId);
}

async function markMessageDelivered(msgId) {
  if (!auth || !auth.currentUser || !db || !msgId) return;
  if (deliveredMsgIds[msgId]) return;
  deliveredMsgIds[msgId] = 1;
  try {
    await updateDoc(msgDocRef(msgId), { deliveredAt: isoNow() });
  } catch (err) {
    delete deliveredMsgIds[msgId];
    console.warn("markMessageDelivered:", err);
  }
}

async function markMessageRead(msgId) {
  if (!auth || !auth.currentUser || !db || !msgId) return;
  if (readMsgIds[msgId]) return;
  readMsgIds[msgId] = 1;
  var now = isoNow();
  var patch = { readAt: now };
  var known = chatMsgsDm.find(function (m) {
    return m && m.id === msgId;
  });
  if (!known || !known.deliveredAt) patch.deliveredAt = now;
  try {
    await updateDoc(msgDocRef(msgId), patch);
  } catch (err) {
    delete readMsgIds[msgId];
    console.warn("markMessageRead:", err);
  }
}

function autoMarkIncomingDelivered(msgs) {
  if (!auth || !auth.currentUser) return;
  var me = auth.currentUser.uid;
  (msgs || []).forEach(function (m) {
    if (!m || m.type !== "dm" || !m.id) return;
    if (m.uid === me) return;
    if (m.toUid && m.toUid !== me) return;
    if (m.deliveredAt || deliveredMsgIds[m.id]) return;
    markMessageDelivered(m.id);
  });
}

async function markChatThreadRead(msgs, myUid) {
  if (!myUid || !msgs || !msgs.length) return;
  var jobs = [];
  msgs.forEach(function (m) {
    if (!m || m.type !== "dm" || !m.id) return;
    if (m.uid === myUid) return;
    if (m.toUid && m.toUid !== myUid) return;
    if (m.readAt || readMsgIds[m.id]) return;
    jobs.push(markMessageRead(m.id));
  });
  if (jobs.length) await Promise.all(jobs);
}

async function ackAssignment(asgnId, kind) {
  if (!auth || !auth.currentUser || !asgnId) return null;
  var key = asgnId + ":" + (kind === "read" ? "read" : "delivered");
  if (ackAsgnIds[key]) return null;
  ackAsgnIds[key] = 1;
  try {
    var fn = httpsCallable(getFunctions(app), "ackAssignment");
    var res = await fn({ asgnId: asgnId, kind: kind === "read" ? "read" : "delivered" });
    return res.data || null;
  } catch (err) {
    delete ackAsgnIds[key];
    console.warn("ackAssignment:", err);
    return null;
  }
}

function bindPushDeliveredListener() {
  if (!("serviceWorker" in navigator) || navigator.serviceWorker.__cv3PushBound) return;
  navigator.serviceWorker.__cv3PushBound = true;
  navigator.serviceWorker.addEventListener("message", function (ev) {
    var payload = ev && ev.data;
    if (!payload || payload.type !== "cv3-push-delivered") return;
    var d = payload.data || {};
    var me = (auth && auth.currentUser && auth.currentUser.uid) || "";
    var myEmp =
      (window.__CV3_AUTH && window.__CV3_AUTH.empId) ||
      (appCv3 && appCv3.S && appCv3.S.auth && appCv3.S.auth.empId) ||
      "";
    if (d.type === "chat" && d.msgId) {
      if (
        d.chatType !== "broadcast" &&
        (!d.toUid || d.toUid === me)
      ) {
        markMessageDelivered(d.msgId);
      }
    }
    if (d.type === "assignment" && d.asgnId) {
      if (myEmp && (!d.empId || String(d.empId) === String(myEmp))) {
        ackAssignment(d.asgnId, "delivered");
      }
    }
    if (appCv3 && typeof appCv3.syncAppBadge === "function") {
      try {
        appCv3.syncAppBadge();
      } catch (e) {}
    }
  });
}

/** Sync unread count to installed PWA icon badge (and SW cache for closed-app bumps). */
function syncServiceWorkerBadge(count) {
  var n = Math.max(0, count | 0);
  if (navigator.setAppBadge) {
    if (n > 0) navigator.setAppBadge(n).catch(function () {});
    else if (navigator.clearAppBadge) navigator.clearAppBadge().catch(function () {});
  }
  if (!("serviceWorker" in navigator)) return;
  var post = function (reg) {
    if (!reg || !reg.active) return;
    try {
      reg.active.postMessage({ type: "cv3-set-badge", count: n });
    } catch (e) {}
  };
  navigator.serviceWorker.getRegistration("/").then(post).catch(function () {});
  if (navigator.serviceWorker.controller) {
    try {
      navigator.serviceWorker.controller.postMessage({ type: "cv3-set-badge", count: n });
    } catch (e2) {}
  }
}

function unsubChatAll() {
  if (unsubChatBc) unsubChatBc();
  if (unsubChatDm) unsubChatDm();
  unsubChatBc = null;
  unsubChatDm = null;
  chatMsgsBc = [];
  chatMsgsDm = [];
}

function stopSubscriptions() {
  if (unsubSnap) unsubSnap();
  unsubSnap = null;
  if (unsubOtherSnap) unsubOtherSnap();
  unsubOtherSnap = null;
  if (unsubEmpMaster) unsubEmpMaster();
  unsubEmpMaster = null;
  if (unsubCustMaster) unsubCustMaster();
  unsubCustMaster = null;
  custMasterById = {};
  custMasterReady = false;
  unsubChatAll();
  if (unsubReports) unsubReports();
  unsubReports = null;
  if (unsubReportsOther) unsubReportsOther();
  unsubReportsOther = null;
  if (unsubAttendance) unsubAttendance();
  unsubAttendance = null;
  historyRangeCache = Object.create(null);
  liveHistorySince = "";
  provisionBusy = false;
  provisionDone = false;
  if (provisionRetryTimer) clearTimeout(provisionRetryTimer);
  provisionRetryTimer = null;
  provisionRetryCount = 0;
  booted = false;
  lastAuthUid = null;
  subsUid = null;
}

function subscribeChat() {
  unsubChatAll();
  if (!db || !auth || !auth.currentUser) return;
  var uid = auth.currentUser.uid;
  var qBc = query(
    chatColRef(),
    where("type", "==", "broadcast"),
    orderBy("at", "asc"),
    limit(200)
  );
  unsubChatBc = onSnapshot(
    qBc,
    function (snap) {
      chatMsgsBc = snap.docs.map(function (d) {
        return Object.assign({ id: d.id }, d.data());
      });
      mergeChatMsgs();
    },
    function (err) {
      console.error("chat broadcast:", err);
    }
  );
  var qDm = query(
    chatColRef(),
    where("participants", "array-contains", uid),
    orderBy("at", "asc"),
    limit(300)
  );
  unsubChatDm = onSnapshot(
    qDm,
    function (snap) {
      chatMsgsDm = snap.docs.map(function (d) {
        return Object.assign({ id: d.id }, d.data());
      });
      mergeChatMsgs();
    },
    function (err) {
      console.error("chat dm:", err);
    }
  );
}

function chatSendErrMsg(err, type) {
  if (!err) return "Không gửi được tin nhắn.";
  var code = String(err.code || "");
  if (code === "permission-denied") {
    if (type === "broadcast") {
      return "Không có quyền gửi thông báo toàn đội. Chỉ giám đốc mới được gửi.";
    }
    return "Không có quyền gửi tin nhắn riêng. Người nhận cần có tài khoản đăng nhập trong cùng tổ chức.";
  }
  var msg = String(err.message || "");
  if (msg && msg.indexOf("Missing or insufficient permissions") >= 0) {
    return type === "broadcast"
      ? "Không có quyền gửi thông báo toàn đội."
      : "Không có quyền gửi tin nhắn riêng. Kiểm tra người nhận đã có tài khoản.";
  }
  return msg || "Không gửi được tin nhắn.";
}

async function sendChatMessage(text, options) {
  if (!auth || !auth.currentUser) return;
  var t = String(text || "").trim();
  if (!t || t.length > 2000) return;
  var info = window.__CV3_AUTH || {};
  var uid = auth.currentUser.uid;
  var opts = options || {};
  var type = opts.type === "broadcast" ? "broadcast" : "dm";
  try {
    if (type === "broadcast") {
      if (!canOperateRole()) {
        throw new Error("Chỉ giám đốc hoặc Điều hành mới được gửi thông báo toàn đội.");
      }
      await addDoc(chatColRef(), {
        text: t,
        type: "broadcast",
        from: info.username || userLabel(auth.currentUser),
        fromName: userLabel(auth.currentUser),
        role: info.role || "director",
        uid: uid,
        at: serverTimestamp(),
      });
      return;
    }
    var toUid = String(opts.toUid || "").trim();
    if (!toUid) throw new Error("Chọn người nhận để gửi tin nhắn riêng.");
    if (toUid === uid) throw new Error("Không thể nhắn tin cho chính mình.");
    var toName = String(opts.toName || "").trim() || toUid;
    var participants = [uid, toUid].sort();
    var threadId = dmThreadId(uid, toUid);
    await addDoc(chatColRef(), {
      text: t,
      type: "dm",
      threadId: threadId,
      toUid: toUid,
      toName: toName,
      participants: participants,
      from: info.username || userLabel(auth.currentUser),
      fromName: userLabel(auth.currentUser),
      role: info.role || "employee",
      uid: uid,
      at: serverTimestamp(),
    });
  } catch (err) {
    throw new Error(chatSendErrMsg(err, type));
  }
}

function reportsColRef(forOrg) {
  return collection(
    doc(db, "workspaces", normalizeOrgId(forOrg || orgId)),
    "reports"
  );
}

function attendanceColRef() {
  return collection(doc(db, "workspaces", orgId), "attendance");
}

function canSubscribeOtherOrgReports() {
  var a = window.__CV3_AUTH || {};
  var other = otherOrgId(orgId);
  if (a.role === "director") return true;
  var allowed = authAllowedOrgIds(a, orgId);
  return allowed.indexOf(other) >= 0 && allowed.length >= 2;
}

function buildReportsQuery(forOrg) {
  var empId = window.__CV3_AUTH && window.__CV3_AUTH.empId;
  var isDir = window.__CV3_AUTH && window.__CV3_AUTH.role === "director";
  var since = historySinceIso();
  var col = reportsColRef(forOrg);
  if (isDir) {
    return query(
      col,
      where("date", ">=", since),
      orderBy("date", "desc"),
      limit(REPORTS_LIVE_LIMIT)
    );
  }
  if (!empId) return null;
  return query(
    col,
    where("empId", "==", empId),
    where("date", ">=", since),
    orderBy("date", "desc"),
    limit(REPORTS_LIVE_LIMIT)
  );
}

function tagReportsOrg(rows, reportOrg) {
  var oid = normalizeOrgId(reportOrg || orgId);
  return (rows || []).map(function (r) {
    return Object.assign({}, r, { _orgId: oid });
  });
}

function todayIso() {
  var d = new Date();
  var offset = d.getTimezoneOffset();
  var local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function isoDaysAgo(days) {
  var d = new Date();
  var offset = d.getTimezoneOffset();
  var local = new Date(d.getTime() - offset * 60 * 1000);
  local.setUTCDate(local.getUTCDate() - Math.max(0, Number(days) || 0));
  return local.toISOString().slice(0, 10);
}

function historySinceIso() {
  return isoDaysAgo(HISTORY_WINDOW_DAYS);
}

function mapSnapDocs(snap) {
  return snap.docs.map(function (d) {
    return Object.assign({ id: d.id }, d.data());
  });
}

function subscribeReports() {
  if (unsubReports) unsubReports();
  unsubReports = null;
  if (unsubReportsOther) unsubReportsOther();
  unsubReportsOther = null;
  if (!db) return;
  var since = historySinceIso();
  liveHistorySince = since;
  var active = orgId;
  var q = buildReportsQuery(active);
  if (!q) return;
  unsubReports = onSnapshot(
    q,
    function (snap) {
      if (orgId !== active) return;
      var reports = tagReportsOrg(mapSnapDocs(snap), active);
      if (appCv3 && appCv3.setReports) {
        appCv3.setReports(reports, { liveSince: since, orgId: active });
      }
    },
    function (err) {
      console.error("reports:", err);
    }
  );

  // NV thuộc 2 đội / giám đốc: đồng bộ báo cáo đội kia (cùng cửa sổ lịch sử).
  if (!canSubscribeOtherOrgReports()) return;
  var other = otherOrgId(active);
  var qOther = buildReportsQuery(other);
  if (!qOther) return;
  unsubReportsOther = onSnapshot(
    qOther,
    function (snap) {
      if (orgId !== active) return;
      if (otherOrgId(orgId) !== other) return;
      var reports = tagReportsOrg(mapSnapDocs(snap), other);
      if (appCv3 && appCv3.setReports) {
        appCv3.setReports(reports, { liveSince: since, orgId: other });
      }
    },
    function (err) {
      console.error("reports other:", err);
    }
  );
}

function subscribeAttendance() {
  if (unsubAttendance) unsubAttendance();
  unsubAttendance = null;
  if (!db || !auth || !auth.currentUser) return;
  var empId = window.__CV3_AUTH && window.__CV3_AUTH.empId;
  var isDir = window.__CV3_AUTH && window.__CV3_AUTH.role === "director";
  var since = historySinceIso();
  liveHistorySince = since;
  var q;
  if (isDir) {
    q = query(
      attendanceColRef(),
      where("date", ">=", since),
      orderBy("date", "desc"),
      limit(ATT_LIVE_LIMIT_DIR)
    );
  } else {
    if (!empId) return;
    q = query(
      attendanceColRef(),
      where("empId", "==", empId),
      where("date", ">=", since),
      orderBy("date", "desc"),
      limit(ATT_LIVE_LIMIT_EMP)
    );
  }
  unsubAttendance = onSnapshot(
    q,
    function (snap) {
      var rows = mapSnapDocs(snap);
      if (appCv3 && appCv3.setAttendance) {
        appCv3.setAttendance(rows, { liveSince: since });
      }
    },
    function (err) {
      console.error("attendance:", err);
    }
  );
}

async function fetchAttendanceRange(from, to, empId) {
  if (!db || !from || !to) return [];
  var snap;
  if (empId) {
    snap = await getDocs(
      query(
        attendanceColRef(),
        where("empId", "==", empId),
        where("date", ">=", from),
        where("date", "<=", to),
        orderBy("date", "desc"),
        limit(ATT_RANGE_LIMIT)
      )
    );
  } else {
    snap = await getDocs(
      query(
        attendanceColRef(),
        where("date", ">=", from),
        where("date", "<=", to),
        orderBy("date", "desc"),
        limit(ATT_RANGE_LIMIT)
      )
    );
  }
  return mapSnapDocs(snap);
}

async function fetchReportsRange(from, to, empId, forOrg) {
  if (!db || !from || !to) return [];
  var targetOrg = normalizeOrgId(forOrg || orgId);
  var col = reportsColRef(targetOrg);
  var snap;
  if (empId) {
    snap = await getDocs(
      query(
        col,
        where("empId", "==", empId),
        where("date", ">=", from),
        where("date", "<=", to),
        orderBy("date", "desc"),
        limit(REPORTS_RANGE_LIMIT)
      )
    );
  } else {
    snap = await getDocs(
      query(
        col,
        where("date", ">=", from),
        where("date", "<=", to),
        orderBy("date", "desc"),
        limit(REPORTS_RANGE_LIMIT)
      )
    );
  }
  return tagReportsOrg(mapSnapDocs(snap), targetOrg);
}

/**
 * Load attendance outside the live window into S.attendance (merge by id).
 * No-op when the range is already covered by the live subscribe window.
 */
async function ensureAttendanceRange(from, to, empId) {
  if (!from || !to || from > to) return [];
  var since = liveHistorySince || historySinceIso();
  if (from >= since) return [];
  var scopeEmp =
    empId ||
    (window.__CV3_AUTH && window.__CV3_AUTH.role === "director"
      ? ""
      : (window.__CV3_AUTH && window.__CV3_AUTH.empId) || "");
  var key =
    "att|" + orgId + "|" + from + "|" + to + "|" + (scopeEmp || "*");
  if (historyRangeCache[key]) return [];
  var rows = await fetchAttendanceRange(from, to, scopeEmp || null);
  historyRangeCache[key] = 1;
  if (appCv3 && appCv3.mergeAttendance) appCv3.mergeAttendance(rows);
  else if (appCv3 && appCv3.setAttendance) {
    appCv3.setAttendance(rows, { merge: true });
  }
  return rows;
}

async function ensureReportsRange(from, to, empId) {
  if (!from || !to || from > to) return [];
  var since = liveHistorySince || historySinceIso();
  if (from >= since) return [];
  var scopeEmp = empId || "";
  var key =
    "rpt|" + orgId + "|" + from + "|" + to + "|" + (scopeEmp || "*");
  if (historyRangeCache[key]) return [];
  var rows = await fetchReportsRange(from, to, scopeEmp || null);
  historyRangeCache[key] = 1;
  if (appCv3 && appCv3.mergeReports) appCv3.mergeReports(rows);
  else if (appCv3 && appCv3.setReports) {
    appCv3.setReports(rows, { merge: true });
  }
  return rows;
}

function monthRangeFromYm(ym) {
  var p = String(ym || "").split("-");
  var y = parseInt(p[0], 10);
  var m = parseInt(p[1], 10);
  if (!y || !m || m < 1 || m > 12) return null;
  var last = new Date(y, m, 0).getDate();
  var pad = function (n) {
    return (n < 10 ? "0" : "") + n;
  };
  return {
    from: y + "-" + pad(m) + "-01",
    to: y + "-" + pad(m) + "-" + pad(last),
  };
}

async function ensureAttendanceMonth(ym, empId) {
  var range = monthRangeFromYm(ym);
  if (!range) return [];
  return ensureAttendanceRange(range.from, range.to, empId);
}

/** Resize/compress before upload (max edge ~1280, JPEG ~0.7) to keep Storage small. */
function compressImageForUpload(file, maxEdge, quality) {
  maxEdge = maxEdge || 1280;
  quality = quality == null ? 0.7 : quality;
  return new Promise(function (resolve) {
    if (!file || !file.type || file.type.indexOf("image/") !== 0) {
      resolve(file);
      return;
    }
    if (typeof document === "undefined" || !document.createElement) {
      resolve(file);
      return;
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      if (!w || !h) {
        resolve(file);
        return;
      }
      var scale = Math.min(1, maxEdge / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * scale));
      var ch = Math.max(1, Math.round(h * scale));
      var canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      var ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, cw, ch);
      canvas.toBlob(
        function (blob) {
          if (!blob) {
            resolve(file);
            return;
          }
          if (blob.size >= file.size && scale === 1) {
            resolve(file);
            return;
          }
          var base = String(file.name || "photo").replace(/\.[^.]+$/, "");
          resolve(
            new File([blob], base + ".jpg", {
              type: "image/jpeg",
              lastModified: Date.now(),
            })
          );
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

async function uploadReportPhotos(files, asgnId, date, reportOrgId) {
  if (!files || !files.length) return [];
  if (!app || !auth || !auth.currentUser) {
    throw new Error("Cần đăng nhập.");
  }
  var storage = getStorage(app);
  var targetOrg = normalizeOrgId(reportOrgId || orgId);
  var urls = [];
  var max = Math.min(files.length, 8);
  for (var i = 0; i < max; i++) {
    var raw = files[i];
    if (!raw || !raw.type || raw.type.indexOf("image/") !== 0) continue;
    var file = await compressImageForUpload(raw);
    if (file.size > 8 * 1024 * 1024) {
      throw new Error("Ảnh «" + (raw.name || "ảnh") + "» quá 8MB.");
    }
    var ext = "jpg";
    if (file.type && file.type.indexOf("jpeg") < 0) {
      ext = (file.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
    }
    // Date folder enables Storage lifecycle + daily purge by YYYY-MM-DD prefix.
    var day = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? String(date) : todayIso();
    var path =
      "workspaces/" +
      targetOrg +
      "/reports/" +
      auth.currentUser.uid +
      "/" +
      day +
      "/" +
      asgnId +
      "_" +
      i +
      "." +
      ext;
    var storageRef = ref(storage, path);
    try {
      await uploadBytes(storageRef, file, { contentType: file.type || "image/jpeg" });
      urls.push(await getDownloadURL(storageRef));
    } catch (err) {
      var why = (err && err.message) || String(err);
      throw new Error("Không tải được ảnh lên máy chủ. " + why);
    }
  }
  return urls;
}

async function uploadAttendancePhotos(files, kind, punchId, date) {
  if (!files || !files.length) return [];
  if (!app || !auth || !auth.currentUser) {
    throw new Error("Cần đăng nhập.");
  }
  var storage = getStorage(app);
  var urls = [];
  var max = Math.min(files.length, kind === "work" ? 12 : 1);
  var pid = String(punchId || Date.now());
  var day = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? String(date) : todayIso();
  for (var i = 0; i < max; i++) {
    var raw = files[i];
    if (!raw || !raw.type || raw.type.indexOf("image/") !== 0) continue;
    var file = await compressImageForUpload(raw);
    if (file.size > 8 * 1024 * 1024) {
      throw new Error("Ảnh «" + (raw.name || "ảnh") + "» quá 8MB.");
    }
    var ext = "jpg";
    if (file.type && file.type.indexOf("jpeg") < 0) {
      ext = (file.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
    }
    // Date folder enables Storage lifecycle + daily purge by YYYY-MM-DD prefix.
    var path =
      "workspaces/" +
      orgId +
      "/attendance/" +
      auth.currentUser.uid +
      "/" +
      day +
      "/" +
      pid +
      "_" +
      kind +
      "_" +
      i +
      "." +
      ext;
    var storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, { contentType: file.type || "image/jpeg" });
    urls.push(await getDownloadURL(storageRef));
  }
  return urls;
}

async function submitAttendance(payload) {
  if (!app || !auth || !auth.currentUser) {
    throw new Error("Cần đăng nhập cloud.");
  }
  var date = payload.date || todayIso();
  var punchId = String(payload.punchId || Date.now());
  var siteUrls = [];
  if (payload.type === "in" && payload.sitePhoto) {
    siteUrls = await uploadAttendancePhotos([payload.sitePhoto], "site", punchId, date);
  }
  var workUrls = [];
  if (payload.type === "out") {
    workUrls = await uploadAttendancePhotos(payload.workPhotos || [], "work", punchId, date);
  }
  var fn = httpsCallable(getFunctions(app), "submitAttendance");
  var res = await fn({
    orgId: orgId,
    type: payload.type,
    date: date,
    punchId: punchId,
    lat: payload.lat,
    lng: payload.lng,
    locationLabel: payload.locationLabel || "",
    sitePhoto: siteUrls[0] || "",
    workPhotos: workUrls,
    lateReason: payload.lateReason || "",
  });
  return res.data || {};
}

async function callSubmitAttendance(payload) {
  try {
    return await submitAttendance(payload);
  } catch (err) {
    var msg = (err && err.message) || String(err);
    if (err && err.code === "functions/invalid-argument" && err.details) {
      msg = String(err.details);
    }
    if (err && err.code === "functions/already-exists" && err.details) {
      msg = String(err.details);
    }
    if (err && err.code === "functions/failed-precondition" && err.details) {
      msg = String(err.details);
    }
    throw new Error(msg);
  }
}

async function uploadArrivalPhoto(file, asgnId) {
  if (!file) return "";
  if (!app || !auth || !auth.currentUser) {
    throw new Error("Cần đăng nhập.");
  }
  if (!file.type || file.type.indexOf("image/") !== 0) {
    throw new Error("File phải là ảnh.");
  }
  file = await compressImageForUpload(file);
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Ảnh quá 8MB.");
  }
  var storage = getStorage(app);
  var ext = "jpg";
  if (file.type && file.type.indexOf("jpeg") < 0) {
    ext = (file.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
  }
  var path =
    "workspaces/" +
    orgId +
    "/arrivals/" +
    auth.currentUser.uid +
    "/" +
    asgnId +
    "_" +
    Date.now() +
    "." +
    ext;
  var storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || "image/jpeg" });
  return await getDownloadURL(storageRef);
}

async function confirmArrival(payload) {
  if (!app || !auth || !auth.currentUser) {
    throw new Error("Cần đăng nhập cloud.");
  }
  var photoUrl = await uploadArrivalPhoto(payload.photo, payload.asgnId);
  var fn = httpsCallable(getFunctions(app), "confirmArrival");
  var res = await fn({
    orgId: orgId,
    asgnId: payload.asgnId,
    reminderId: payload.reminderId || "",
    lat: payload.lat,
    lng: payload.lng,
    locationLabel: payload.locationLabel || "",
    photo: photoUrl,
  });
  return res.data || {};
}

async function callConfirmArrival(payload) {
  try {
    return await confirmArrival(payload);
  } catch (err) {
    var msg = (err && err.message) || String(err);
    if (err && err.details) msg = String(err.details);
    throw new Error(msg);
  }
}

async function submitDailyReport(payload) {
  if (!app || !auth || !auth.currentUser) {
    throw new Error("Cần đăng nhập cloud.");
  }
  var date = payload.date || todayIso();
  var reportOrg = normalizeOrgId(payload.orgId || orgId);
  var photoUrls = await uploadReportPhotos(
    payload.photos || [],
    payload.asgnId,
    date,
    reportOrg
  );
  var fn = httpsCallable(getFunctions(app, "us-central1"), "submitDailyReport");
  var res = await fn({
    orgId: reportOrg,
    asgnId: payload.asgnId,
    date: date,
    prog: payload.prog,
    note: payload.note,
    photos: photoUrls,
  });
  return res.data || {};
}

async function callSubmitReport(payload) {
  try {
    return await submitDailyReport(payload);
  } catch (err) {
    var msg = (err && err.message) || String(err);
    if (err && err.details) msg = String(err.details);
    // Firebase thường gắn prefix "PERMISSION_DENIED: " — bỏ để hiện câu tiếng Việt.
    msg = String(msg)
      .replace(/^Firebase:\s*/i, "")
      .replace(/^[A-Z_]+:\s*/, "");
    throw new Error(msg || "Không gửi được báo cáo.");
  }
}

function isDirectorRole() {
  return window.__CV3_AUTH && window.__CV3_AUTH.role === "director";
}

function authEmpGroup() {
  var a = window.__CV3_AUTH || {};
  if (a.empGroup) return a.empGroup;
  if (a.empId && appCv3 && appCv3.S && Array.isArray(appCv3.S.emp)) {
    var e = appCv3.S.emp.find(function (x) {
      return x && x.id === a.empId;
    });
    if (e && e.group) return e.group;
  }
  return "";
}

function canOperateRole() {
  if (isDirectorRole()) return true;
  return authEmpGroup() === "Điều hành";
}

function hasFullUIRole() {
  if (isDirectorRole()) return true;
  var g = authEmpGroup();
  return g === "Điều hành" || g === "Giám sát" || g === CHIEF_GROUP;
}

/** Chỉ giám đốc / Điều hành / Giám sát mới thấy tách 2 phần Công trình. */
function showsOrgPartition() {
  return hasFullUIRole();
}

async function syncEmpGroupToUserDoc(empId, group) {
  if (!auth || !auth.currentUser || !db) return;
  var g = String(group || "");
  try {
    await setDoc(
      doc(db, "users", auth.currentUser.uid),
      { empId: empId || "", empGroup: g, updatedAt: serverTimestamp() },
      { merge: true }
    );
    var cur = window.__CV3_AUTH || {};
    if (cur.uid === auth.currentUser.uid) {
      publishAuth(Object.assign({}, cur, { empId: empId || cur.empId, empGroup: g }));
    }
  } catch (err) {
    console.warn("syncEmpGroupToUserDoc:", err);
  }
}

async function hasDirectorInOrg(org) {
  if (!app) return true;
  try {
    var fn = httpsCallable(getFunctions(app), "hasDirectorInOrg");
    var res = await fn({ orgId: org || defaultOrg });
    return !!(res.data && res.data.hasDirector);
  } catch (err) {
    console.warn("hasDirectorInOrg:", err);
    return true;
  }
}

async function claimDirectorRole(username, org) {
  var fn = httpsCallable(getFunctions(app), "claimDirectorRole");
  await fn({ username: username, orgId: org || defaultOrg });
}

async function saveMyFcmToken(token, empId) {
  if (!auth || !auth.currentUser || !db) return;
  await setDoc(
    doc(db, "users", auth.currentUser.uid),
    { fcmToken: token, empId: empId || "" },
    { merge: true }
  );
}

async function provisionEmployeeAccount(payload) {
  if (!app || !auth || !auth.currentUser) {
    throw new Error("Cần đăng nhập cloud.");
  }
  var fn = httpsCallable(getFunctions(app), "provisionEmployee");
  try {
    var res = await fn(payload || {});
    return res.data || {};
  } catch (err) {
    var msg =
      (err && err.message) ||
      (err && err.details) ||
      "Không tạo được tài khoản nhân viên.";
    throw new Error(msg);
  }
}

function empNeedsAuth(e) {
  if (!e || e.authUid) return false;
  var lk = e.loginKey || sanitizeUsername(e.name);
  return lk.length >= 2;
}

function countEmpNeedingAuth(cv3) {
  var emps = (cv3 && cv3.S && cv3.S.emp) || [];
  return emps.filter(empNeedsAuth).length;
}

function ensureEmpLoginKeys(cv3) {
  if (!cv3 || !cv3.S || !cv3.S.emp) return false;
  var changed = false;
  cv3.S.emp = cv3.S.emp.map(function (e) {
    var lk = e.loginKey || sanitizeUsername(e.name);
    if (!e.loginKey && lk.length >= 2) {
      changed = true;
      return Object.assign({}, e, { loginKey: lk });
    }
    return e;
  });
  return changed;
}

function scheduleProvision(cv3, options) {
  var opts = options || {};
  if (!cv3) return;
  if (provisionRetryTimer) clearTimeout(provisionRetryTimer);
  var delay = opts.delay != null ? opts.delay : opts.force ? 0 : 500;
  provisionRetryTimer = setTimeout(function () {
    provisionRetryTimer = null;
    provisionAllEmployees(cv3, opts).catch(function () {});
  }, delay);
}

async function provisionAllEmployees(cv3, options) {
  var opts = options || {};
  var force = !!opts.force;
  if (!app || !auth || !auth.currentUser || !canOperateRole()) {
    if (force) throw new Error("Chỉ giám đốc hoặc Điều hành đã đăng nhập mới tạo được tài khoản.");
    return null;
  }
  if (provisionBusy) {
    if (force) throw new Error("Đang tạo tài khoản — vui lòng đợi vài giây.");
    return null;
  }
  ensureEmpLoginKeys(cv3);
  if (force) provisionRetryCount = 0;
  if (!force && provisionDone && !countEmpNeedingAuth(cv3)) return null;
  if (!force && !countEmpNeedingAuth(cv3)) return null;
  provisionBusy = true;
  setSync("syncing", "Đang tạo tài khoản nhân viên…");
  try {
    var fn = httpsCallable(getFunctions(app), "provisionAllEmployees");
    var res = await fn({ orgId: orgId });
    var data = res.data || {};
    mergeProvisionIntoApp(cv3, data);
    if (data.patch != null) remotePatch = Math.max(remotePatch, data.patch);
    var n = data.created || 0;
    var linked = data.linked || 0;
    var stillNeed = countEmpNeedingAuth(cv3);
    if (stillNeed) {
      provisionDone = false;
      if (!force && provisionRetryCount < PROVISION_RETRY_MAX) {
        provisionRetryCount += 1;
        scheduleProvision(cv3, {
          force: false,
          delay: 1500 * provisionRetryCount,
        });
        setSync(
          "syncing",
          "Đang tạo tài khoản nhân viên… (lần " +
            (provisionRetryCount + 1) +
            ")"
        );
      } else if (force) {
        setSync("error", "Vẫn còn nhân viên chưa có tài khoản — thử lại sau.");
      }
    } else {
      provisionDone = true;
      provisionRetryCount = 0;
      setSync(
        "online",
        (n
          ? "Đã tạo " + n + " tài khoản"
          : linked
            ? "Đã liên kết " + linked + " tài khoản"
            : "Tài khoản nhân viên đã sẵn sàng") +
          " · " +
          orgId
      );
    }
    return data;
  } catch (err) {
    console.error("provisionAllEmployees:", err);
    provisionDone = false;
    var msg = callableErrMsg(err, "Không tạo được tài khoản nhân viên");
    setSync("error", msg);
    if (!force && provisionRetryCount < PROVISION_RETRY_MAX) {
      provisionRetryCount += 1;
      scheduleProvision(cv3, {
        force: false,
        delay: 2000 * provisionRetryCount,
      });
    }
    if (force) throw new Error(msg);
    return null;
  } finally {
    provisionBusy = false;
  }
}

async function changeMyPassword(payload) {
  if (!app || !auth || !auth.currentUser) {
    throw new Error("Cần đăng nhập cloud.");
  }
  var user = auth.currentUser;
  var currentPassword = String((payload && payload.currentPassword) || "");
  var newPassword = String((payload && payload.newPassword) || "");
  if (!currentPassword) {
    throw new Error("Nhập mật khẩu hiện tại để xác nhận.");
  }
  if (newPassword.length < 6) {
    throw new Error("Mật khẩu mới cần ít nhất 6 ký tự.");
  }
  if (currentPassword === newPassword) {
    throw new Error("Mật khẩu mới phải khác mật khẩu hiện tại.");
  }
  if (!user.email) {
    throw new Error("Tài khoản không có email đăng nhập.");
  }
  try {
    var cred = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, cred);
  } catch (err) {
    var c = (err && err.code) || "";
    if (
      c === "auth/wrong-password" ||
      c === "auth/invalid-credential" ||
      c === "auth/invalid-login-credentials"
    ) {
      throw new Error("Mật khẩu hiện tại không đúng.");
    }
    if (c === "auth/too-many-requests") {
      throw new Error("Thử quá nhiều lần — đợi vài phút rồi thử lại.");
    }
    throw new Error((err && err.message) || "Không xác minh được mật khẩu hiện tại.");
  }
  try {
    await updatePassword(user, newPassword);
  } catch (err2) {
    var c2 = (err2 && err2.code) || "";
    if (c2 === "auth/weak-password") {
      throw new Error("Mật khẩu mới quá yếu — cần ít nhất 6 ký tự.");
    }
    if (c2 === "auth/requires-recent-login") {
      throw new Error("Phiên đăng nhập đã cũ — nhập lại mật khẩu hiện tại rồi thử lại.");
    }
    throw new Error((err2 && err2.message) || "Không đổi được mật khẩu.");
  }
  if (isBiometricEnabled()) {
    try {
      var un =
        (window.__CV3_AUTH && window.__CV3_AUTH.username) ||
        emailToUsername((auth.currentUser && auth.currentUser.email) || "");
      await updateBiometricPassword(newPassword, un);
    } catch (bioErr) {
      console.warn("updateBiometricPassword:", bioErr);
    }
  }
  return { ok: true };
}

async function updateMyProfile(payload) {
  if (!app || !auth || !auth.currentUser) {
    throw new Error("Cần đăng nhập cloud.");
  }
  var fn = httpsCallable(getFunctions(app), "updateMyProfile");
  try {
    var res = await fn(payload || {});
    var data = res.data || {};
    var cur = window.__CV3_AUTH || {};
    publishAuth(
      Object.assign({}, cur, {
        displayName: data.displayName != null ? data.displayName : cur.displayName,
        age: data.age !== undefined ? data.age : cur.age,
        empId: data.empId || cur.empId,
        username: data.username || cur.username,
      })
    );
    return data;
  } catch (err) {
    var msg2 =
      (err && err.message) ||
      (err && err.details) ||
      "Không lưu được thông tin tài khoản.";
    throw new Error(msg2);
  }
}

async function updateMyUsername(payload) {
  if (!app || !auth || !auth.currentUser) {
    throw new Error("Cần đăng nhập cloud.");
  }
  var fn = httpsCallable(getFunctions(app), "updateMyUsername");
  try {
    var res = await fn(payload || {});
    var data = res.data || {};
    var cur = window.__CV3_AUTH || {};
    publishAuth(Object.assign({}, cur, { username: data.username || cur.username }));
    if (data.username && isBiometricEnabled()) {
      try {
        await updateBiometricUsername(data.username);
      } catch (bioErr) {
        console.warn("updateBiometricUsername:", bioErr);
      }
    }
    return data;
  } catch (err) {
    var msg3 =
      (err && err.message) ||
      (err && err.details) ||
      "Không đổi được tên đăng nhập.";
    throw new Error(msg3);
  }
}

function $(id) {
  return document.getElementById(id);
}

function setSync(status, text) {
  var dot = $("sync-dot");
  if (!dot) return;
  var lite = status === "online" || status === "syncing" ? "online" : "offline";
  dot.className = "sync-dot sync-" + lite;
  dot.title = text || (lite === "online" ? "Online" : "Offline");
}

function sanitizeUsername(name) {
  var s = String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, "");
  s = s.replace(/[^a-z0-9._-]/g, "");
  return s;
}

function userToEmail(username, org) {
  var u = sanitizeUsername(username);
  if (u.length < 2) {
    var e = new Error("Tên đăng nhập cần ít nhất 2 ký tự (chữ hoặc số).");
    e.code = "auth/invalid-username";
    throw e;
  }
  // Email công ty dùng chung (không gắn org) — hỗ trợ 1 tài khoản nhiều đội
  return u + "@qlcv.local";
}

function legacyUserToEmail(username, org) {
  var u = sanitizeUsername(username);
  var o = normalizeOrgId(org || defaultOrg);
  return o + "." + u + "@qlcv.local";
}

/** Email Auth cũ (trước khi đổi mã đội), vd. saree.phuong@qlcv.local */
function historicalLegacyEmails(username) {
  var u = sanitizeUsername(username);
  if (u.length < 2) return [];
  var out = [];
  Object.keys(ORG_ALIAS).forEach(function (alias) {
    out.push(alias + "." + u + "@qlcv.local");
  });
  return out;
}

function authEmailCandidates(username, orgHint) {
  var u = sanitizeUsername(username);
  var emails = [];
  function push(e) {
    if (e && emails.indexOf(e) < 0) emails.push(e);
  }
  push(userToEmail(u));
  var rawHint = orgHint || "";
  try {
    if (!rawHint) rawHint = localStorage.getItem("cv3_active_org") || "";
  } catch (e) {}
  if (rawHint) push(legacyUserToEmail(u, rawHint));
  allOrgIds().forEach(function (o) {
    push(legacyUserToEmail(u, o));
  });
  historicalLegacyEmails(u).forEach(push);
  return emails;
}

function emailToUsername(email) {
  if (!email) return "";
  var raw = String(email);
  var m = raw.match(/^[^.]+\.([^@]+)@qlcv\.local$/i);
  if (m) return m[1];
  var m2 = raw.match(/^([^@]+)@qlcv\.local$/i);
  if (m2) return m2[1];
  return raw.split("@")[0] || "";
}

function resolveAuthIdentity(input, orgHint) {
  var raw = String(input || "").trim();
  if (raw.indexOf("@") >= 0) {
    return {
      email: raw,
      username: emailToUsername(raw),
      legacyEmail: null,
      legacyEmails: [],
    };
  }
  var username = sanitizeUsername(raw);
  var candidates = authEmailCandidates(username, orgHint);
  var primary = candidates[0] || userToEmail(username);
  var legacyEmails = candidates.slice(1);
  return {
    email: primary,
    legacyEmail: legacyEmails[0] || null,
    legacyEmails: legacyEmails,
    username: username,
  };
}

function userLabel(user) {
  if (!user) return "";
  return user.displayName || emailToUsername(user.email || "");
}

function showAuth(show) {
  var el = $("auth-overlay");
  if (!el) return;
  if (authOverlayVisible === show) return;
  authOverlayVisible = show;
  el.style.display = show ? "flex" : "none";
  if (show) refreshBiometricLoginUI();
}

async function refreshBiometricLoginUI() {
  var wrap = $("auth-bio-wrap");
  var btn = $("auth-bio-btn");
  var hint = $("auth-bio-hint");
  if (!wrap || !btn) return;
  var form = $("auth-form");
  var mode = (form && form.dataset.mode) || "login";
  if (mode !== "login") {
    wrap.style.display = "none";
    return;
  }
  try {
    var st = await getBiometricStatus();
    var show = st.available && st.enabled;
    wrap.style.display = show ? "block" : "none";
    if (hint) {
      hint.textContent = "";
      hint.style.display = "none";
    }
    btn.disabled = !show;
  } catch (e) {
    wrap.style.display = "none";
  }
}

async function syncOrOfferBiometric(username, password, user) {
  try {
    if (!password || password.length < 6) return;
    if (!(await isBiometricAvailable())) return;
    var st = await getBiometricStatus();
    if (st.enabled) {
      if (st.username && st.username === username) {
        try {
          await updateBiometricPassword(password, username);
        } catch (bioUpd) {
          console.warn("sync biometric password:", bioUpd);
        }
        return;
      }
      var switchOk = window.confirm(
        "Máy này đang bật sinh trắc học cho @" +
          (st.username || "tài khoản khác") +
          ".\n\nChuyển sang tài khoản @" +
          username +
          "?"
      );
      if (!switchOk) return;
      await disableBiometric();
    } else {
      var ok = window.confirm(
        "Thiết bị hỗ trợ vân tay / khuôn mặt.\n\nBật đăng nhập sinh trắc học để lần sau không cần nhập mật khẩu?"
      );
      if (!ok) return;
    }
    await enableBiometric({
      username: username,
      password: password,
      uid: (user && user.uid) || "",
      displayName: (user && user.displayName) || username,
    });
    if (typeof window.showAppToast === "function") {
      window.showAppToast("Đã bật đăng nhập sinh trắc học.", "ok");
    } else {
      alert("Đã bật đăng nhập sinh trắc học.");
    }
    refreshBiometricLoginUI();
  } catch (err) {
    console.warn("biometric setup:", err);
    alert(formatBiometricError(err));
  }
}

async function loginWithBiometric() {
  var errEl = $("auth-err");
  var btn = $("auth-bio-btn");
  if (errEl) errEl.textContent = "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang xác thực…";
  }
  try {
    var creds = await authenticateBiometric();
    var id = resolveAuthIdentity(creds.username);
    var lc = await signInWithIdentity(id, creds.password);
    await ensureUserDoc(lc.user, null, id.username);
    showAuth(false);
  } catch (err) {
    if (errEl) errEl.textContent = formatBiometricError(err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Đăng nhập bằng sinh trắc học";
    }
    refreshBiometricLoginUI();
  }
}

async function enableBiometricForCurrentUser(password) {
  if (!auth || !auth.currentUser) throw new Error("Cần đăng nhập trước.");
  var user = auth.currentUser;
  var username =
    (window.__CV3_AUTH && window.__CV3_AUTH.username) ||
    emailToUsername(user.email || "");
  if (!user.email) throw new Error("Tài khoản chưa có email đăng nhập.");
  try {
    var cred = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, cred);
  } catch (err) {
    var code = (err && err.code) || "";
    if (
      code === "auth/wrong-password" ||
      code === "auth/invalid-credential" ||
      code === "auth/invalid-login-credentials"
    ) {
      throw new Error("Mật khẩu không đúng.");
    }
    throw new Error(formatBiometricError(err) || "Không xác minh được mật khẩu.");
  }
  await enableBiometric({
    username: username,
    password: password,
    uid: user.uid,
    displayName: user.displayName || username,
  });
  return getBiometricStatus();
}

function updateAuthHints(mode) {
  var passHint = $("auth-pass-hint");
  var loginBtn = $("auth-login-mode");
  var desc = $("auth-desc");
  if (desc) {
    desc.textContent = "";
    desc.style.display = "none";
  }
  if (mode === "signup") {
    if (passHint) {
      passHint.textContent = "";
      passHint.style.display = "none";
    }
    if (loginBtn) loginBtn.style.display = "inline-flex";
  } else {
    if (passHint) {
      passHint.textContent = "Mật khẩu mặc định lần đầu: 123456";
      passHint.style.display = "block";
    }
    if (loginBtn) loginBtn.style.display = "none";
  }
}

async function refreshBootstrapUI() {
  /* Sign-in screen shows login only — no director first-setup entry. */
}

function switchToBootstrapSignup() {
  var form = $("auth-form");
  var userInput = $("auth-user");
  var passInput = $("auth-pass");
  if (userInput) userInput.value = "";
  if (passInput) {
    passInput.value = "";
    passInput.focus();
  }
  if (form) form.dataset.mode = "signup";
  if ($("auth-title")) $("auth-title").textContent = "Thiết lập giám đốc lần đầu";
  if ($("auth-submit")) $("auth-submit").textContent = "Đăng ký";
  if ($("auth-err")) $("auth-err").textContent = "";
  var forgot = $("auth-forgot-director");
  if (forgot) forgot.style.display = "none";
  updateAuthHints("signup");
}

function switchToLoginMode() {
  var form = $("auth-form");
  if (form) form.dataset.mode = "login";
  if ($("auth-title")) $("auth-title").textContent = "Đăng nhập";
  if ($("auth-submit")) $("auth-submit").textContent = "Đăng nhập";
  if ($("auth-err")) $("auth-err").textContent = "";
  var forgot = $("auth-forgot-director");
  if (forgot) forgot.style.display = "none";
  updateAuthHints("login");
  refreshBootstrapUI();
  refreshBiometricLoginUI();
}

function openAuthPanel() {
  switchToLoginMode();
  showAuth(true);
  refreshBootstrapUI();
}

function showDirectorForgotHint(show) {
  var forgot = $("auth-forgot-director");
  if (forgot) forgot.style.display = show ? "block" : "none";
}

function updateAuthButtons(user) {
  var btnIn = $("auth-signin");
  var btnOut = $("auth-signout");
  if (btnIn) btnIn.style.display = user ? "none" : "inline-flex";
  if (btnOut) btnOut.style.display = "none";
}

async function doSignOut() {
  stopSubscriptions();
  try {
    await signOut(auth);
  } catch (err) {
    console.error("signOut:", err);
    setSync("error", "Không đăng xuất được");
    return;
  }
  publishAuth(null);
  updateAuthButtons(null);
  switchToLoginMode();
  showAuth(true);
  refreshBootstrapUI();
  setSync("offline", "Đã đăng xuất — bấm Đăng nhập");
}

function waitApp() {
  return new Promise(function (resolve) {
    if (window.__CV3) return resolve(window.__CV3);
    var n = 0;
    var t = setInterval(function () {
      if (window.__CV3 || ++n > 200) {
        clearInterval(t);
        resolve(window.__CV3);
      }
    }, 25);
  });
}

function workspaceRef(forOrg) {
  return doc(db, "workspaces", normalizeOrgId(forOrg || orgId), "data", "main");
}

function payloadFromApp(cv3, forOrg) {
  var active = normalizeOrgId(forOrg || orgId);
  var emps = (cv3.S.empAll && cv3.S.empAll.length ? cv3.S.empAll : cv3.S.emp) || [];
  var orgEmps = emps
    .filter(function (e) {
      if (!e || e.accountRole === "director") return false;
      var ids = normalizeOrgIds(e.orgIds, active);
      return ids.indexOf(active) >= 0;
    })
    .map(function (e) {
      return Object.assign({}, e, { orgIds: normalizeOrgIds(e.orgIds, active) });
    });
  return {
    emp: orgEmps,
    // Khách hàng dùng chung tại company/main/customers — không ghi vào workspace
    cust: [],
    proj: cv3.S.proj,
    asgn: cv3.S.asgn,
    projLog: cv3.S.projLog || [],
    reminders: cv3.S.reminders || [],
    auditLog: cv3.S.auditLog || [],
    trash: cv3.S.trash || [],
    cfg: cv3.S.cfg,
    patch: cv3.getPatch(),
    updatedAt: serverTimestamp(),
    updatedBy: auth && auth.currentUser ? userLabel(auth.currentUser) : "",
  };
}

function applyRemote(cv3, data) {
  var patch = data.patch || 0;
  // Early-out trước khi merge emp (tránh CPU/GC trên mọi echo snapshot).
  if (writing && !forceWorkspaceApply) {
    if (patch > remotePatch) remotePatch = patch;
    if (data.emp && cv3.mergeEmpAuthFromRemote) cv3.mergeEmpAuthFromRemote(data.emp);
    return false;
  }
  var forceApply = !booted || forceWorkspaceApply;
  if (!forceApply && canOperateRole() && patch <= cv3.getPatch()) {
    if (patch > remotePatch) remotePatch = patch;
    if (data.emp && cv3.mergeEmpAuthFromRemote) cv3.mergeEmpAuthFromRemote(data.emp);
    maybeRefreshEmpGroup(cv3);
    return false;
  }
  if (!forceApply && !canOperateRole() && !(patch > remotePatch)) {
    if (data.emp && cv3.mergeEmpAuthFromRemote) cv3.mergeEmpAuthFromRemote(data.emp);
    maybeRefreshEmpGroup(cv3);
    return false;
  }
  if (forceApply) forceWorkspaceApply = false;

  var remoteEmp = data.emp || [];
  // Merge workspace emp cache with company master (master wins on overlap).
  var mergedEmp = mergeEmpLists(remoteEmp, Object.keys(empMasterById).map(function (k) {
    return empMasterById[k];
  }), orgId);
  var payload = {
    emp: mergedEmp.forOrg,
    empAll: mergedEmp.all,
    // cust từ shared master — không lấy từ workspace
    proj: Array.isArray(data.proj) ? data.proj : [],
    asgn: Array.isArray(data.asgn) ? data.asgn : [],
    projLog: Array.isArray(data.projLog) ? data.projLog : [],
    reminders: Array.isArray(data.reminders) ? data.reminders : [],
    auditLog: Array.isArray(data.auditLog) ? data.auditLog : [],
    trash: Array.isArray(data.trash) ? data.trash : [],
    cfg: data.cfg,
    patch: patch,
  };
  // Fallback tạm nếu master chưa sẵn sàng và workspace còn cust cũ
  if (!custMasterReady && Array.isArray(data.cust) && data.cust.length) {
    payload.cust = data.cust;
  }
  if (!canOperateRole()) {
    cv3.applyRemote(payload);
    remotePatch = patch;
    if (data.emp && cv3.mergeEmpAuthFromRemote) cv3.mergeEmpAuthFromRemote(data.emp);
    maybeRefreshEmpGroup(cv3);
    return true;
  }
  cv3.applyRemote(payload);
  remotePatch = patch;
  maybeRefreshEmpGroup(cv3);
  return true;
}

function mergeEmpLists(workspaceEmp, masterEmp, activeOrg) {
  var byId = {};
  (workspaceEmp || []).forEach(function (e) {
    if (!e || !e.id) return;
    byId[e.id] = Object.assign({}, e, {
      orgIds: normalizeOrgIds(e.orgIds, activeOrg),
    });
  });
  (masterEmp || []).forEach(function (e) {
    if (!e || !e.id) return;
    var prev = byId[e.id] || {};
    byId[e.id] = Object.assign({}, prev, e, {
      orgIds: normalizeOrgIds(e.orgIds || prev.orgIds, activeOrg),
    });
  });
  var all = Object.keys(byId).map(function (id) {
    return byId[id];
  });
  var forOrg = all.filter(function (e) {
    return normalizeOrgIds(e.orgIds, activeOrg).indexOf(normalizeOrgId(activeOrg)) >= 0;
  });
  return { all: all, forOrg: forOrg };
}

function empMasterColRef() {
  return collection(doc(db, "company", "main"), "employees");
}

function custMasterColRef() {
  return collection(doc(db, "company", "main"), "customers");
}

function subscribeEmpMaster(cv3) {
  if (unsubEmpMaster) unsubEmpMaster();
  if (!db) return;
  unsubEmpMaster = onSnapshot(
    empMasterColRef(),
    function (snap) {
      empMasterById = {};
      snap.forEach(function (d) {
        empMasterById[d.id] = Object.assign({ id: d.id }, d.data());
      });
      if (!cv3 || !cv3.S) return;
      // Đang ghi master/workspace → đừng render liên tục (mỗi doc = 1 snapshot).
      if (writing) {
        pendingMasterUi = true;
        return;
      }
      pushEmpMasterToApp(cv3);
      // Không rebuild org switcher ở đây — innerHTML mới nuốt mất click đổi đội.
    },
    function (err) {
      console.warn("emp master:", err);
    }
  );
}

function subscribeCustMaster(cv3) {
  if (unsubCustMaster) unsubCustMaster();
  if (!db) return;
  unsubCustMaster = onSnapshot(
    custMasterColRef(),
    function (snap) {
      custMasterById = {};
      var list = [];
      snap.forEach(function (d) {
        var row = Object.assign({ id: d.id }, d.data(), { id: d.id });
        custMasterById[d.id] = row;
        list.push(row);
      });
      custMasterReady = true;
      if (!cv3 || !cv3.S) return;
      if (writing) {
        pendingMasterUi = true;
        return;
      }
      pushCustMasterToApp(cv3, list);
    },
    function (err) {
      console.warn("cust master:", err);
    }
  );
}

function pushEmpMasterToApp(cv3) {
  if (!cv3 || !cv3.S) return;
  var merged = mergeEmpLists(
    cv3.S.emp || [],
    Object.keys(empMasterById).map(function (k) {
      return empMasterById[k];
    }),
    orgId
  );
  if (cv3.applyEmpMaster) {
    cv3.applyEmpMaster(merged.all, merged.forOrg);
  } else {
    cv3.S.empAll = merged.all;
    cv3.S.emp = merged.forOrg;
    if (cv3.render) cv3.render();
  }
}

function pushCustMasterToApp(cv3, list) {
  if (!cv3 || !cv3.S) return;
  if (!list) {
    list = Object.keys(custMasterById).map(function (k) {
      return custMasterById[k];
    });
  }
  if (cv3.applyCustMaster) {
    cv3.applyCustMaster(list);
  } else {
    cv3.S.cust = list;
    if (cv3.render) cv3.render();
  }
}

function flushPendingMasterUi(cv3) {
  if (!pendingMasterUi || !cv3) return;
  pendingMasterUi = false;
  pushEmpMasterToApp(cv3);
  if (custMasterReady) pushCustMasterToApp(cv3);
}

function masterFieldSig(v) {
  if (v == null) return "";
  if (typeof v !== "object") return String(v);
  // Firestore Timestamp
  if (typeof v.toMillis === "function") return "t:" + v.toMillis();
  if (typeof v.seconds === "number") return "t:" + v.seconds;
  try {
    return JSON.stringify(v);
  } catch (e) {
    return "?";
  }
}

/** So khớp field local với master (bỏ updatedAt) — tránh upsert lại khi không đổi. */
function masterDocUnchanged(local, remote) {
  if (!local || !remote) return false;
  var keys = Object.keys(local);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k === "updatedAt") continue;
    if (masterFieldSig(local[k]) !== masterFieldSig(remote[k])) return false;
  }
  return true;
}

function subscribeOtherOrgAsgn(cv3) {
  if (unsubOtherSnap) unsubOtherSnap();
  unsubOtherSnap = null;
  if (!db || !auth || !auth.currentUser) return;
  var other = otherOrgId(orgId);
  var a = window.__CV3_AUTH || {};
  var allowed = authAllowedOrgIds(a, orgId);
  // Chỉ mirror đội kia khi tài khoản được gán cả 2 đội (hoặc giám đốc)
  var canSeeOther = allowed.indexOf(other) >= 0 && allowed.length >= 2;
  if (a.role === "director") canSeeOther = true;
  if (!canSeeOther) {
    if (cv3 && cv3.setOtherOrgAsgn) cv3.setOtherOrgAsgn([], other, []);
    return;
  }
  unsubOtherSnap = onSnapshot(
    doc(db, "workspaces", other, "data", "main"),
    function (snap) {
      if (otherOrgId(orgId) !== other) return;
      if (!snap.exists()) {
        if (cv3 && cv3.setOtherOrgAsgn) cv3.setOtherOrgAsgn([], other, []);
        return;
      }
      var data = snap.data() || {};
      var asgn = (data.asgn || []).map(function (x) {
        return Object.assign({}, x, { _orgId: other });
      });
      var proj = (data.proj || []).map(function (x) {
        return Object.assign({}, x, { _orgId: other });
      });
      if (cv3 && cv3.setOtherOrgAsgn) cv3.setOtherOrgAsgn(asgn, other, proj);
    },
    function (err) {
      console.warn("other org asgn:", err);
    }
  );
}

async function upsertEmpToMaster(emp) {
  if (!db || !emp || !emp.id) return;
  var payload = Object.assign({}, emp, {
    orgIds: normalizeOrgIds(emp.orgIds, orgId),
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, "company", "main", "employees", emp.id), payload, {
    merge: true,
  });
  empMasterById[emp.id] = Object.assign({}, payload, { updatedAt: Date.now() });
}

async function upsertCustToMaster(cust) {
  if (!db || !cust || !cust.id) return;
  var payload = Object.assign({}, cust, {
    id: cust.id,
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, "company", "main", "customers", cust.id), payload, {
    merge: true,
  });
  custMasterById[cust.id] = Object.assign({}, payload, { updatedAt: Date.now() });
}

async function deleteCustFromMaster(custId) {
  if (!db || !custId) return;
  await deleteDoc(doc(db, "company", "main", "customers", custId));
  delete custMasterById[custId];
}

async function commitMasterBatches(ops) {
  if (!db || !ops || !ops.length) return;
  for (var i = 0; i < ops.length; i += MASTER_BATCH_LIMIT) {
    var slice = ops.slice(i, i + MASTER_BATCH_LIMIT);
    var batch = writeBatch(db);
    for (var j = 0; j < slice.length; j++) {
      batch.set(slice[j].ref, slice[j].data, { merge: true });
    }
    await batch.commit();
    for (var k = 0; k < slice.length; k++) {
      var op = slice[k];
      if (op.kind === "emp") {
        empMasterById[op.id] = Object.assign({}, op.cache, {
          updatedAt: Date.now(),
        });
      } else if (op.kind === "cust") {
        custMasterById[op.id] = Object.assign({}, op.cache, {
          updatedAt: Date.now(),
        });
      }
    }
  }
}

/** Chỉ ghi emp/cust master đã đổi — batch thay vì N+1 await tuần tự. */
async function syncMastersFromApp(cv3) {
  if (!db || !cv3 || !cv3.S) return;
  var ops = [];
  var pool =
    (cv3.S.empAll && cv3.S.empAll.length ? cv3.S.empAll : cv3.S.emp) || [];
  for (var i = 0; i < pool.length; i++) {
    var e = pool[i];
    if (!e || !e.id || e.accountRole === "director") continue;
    var empPayload = Object.assign({}, e, {
      orgIds: normalizeOrgIds(e.orgIds, orgId),
    });
    if (masterDocUnchanged(empPayload, empMasterById[e.id])) continue;
    var empWrite = Object.assign({}, empPayload, {
      updatedAt: serverTimestamp(),
    });
    ops.push({
      kind: "emp",
      id: e.id,
      ref: doc(db, "company", "main", "employees", e.id),
      data: empWrite,
      cache: empPayload,
    });
  }
  var list = cv3.S.cust || [];
  for (var j = 0; j < list.length; j++) {
    var c = list[j];
    if (!c || !c.id) continue;
    if (masterDocUnchanged(c, custMasterById[c.id])) continue;
    var custPayload = Object.assign({}, c, { id: c.id });
    var custWrite = Object.assign({}, custPayload, {
      updatedAt: serverTimestamp(),
    });
    ops.push({
      kind: "cust",
      id: c.id,
      ref: doc(db, "company", "main", "customers", c.id),
      data: custWrite,
      cache: custPayload,
    });
  }
  if (!ops.length) return;
  await commitMasterBatches(ops);
}

async function syncCustMasterFromApp(cv3) {
  return syncMastersFromApp(cv3);
}

async function setEmpOrgMembership(empId, orgIds) {
  if (!app || !auth || !auth.currentUser) {
    throw new Error("Cần đăng nhập cloud.");
  }
  var fn = httpsCallable(getFunctions(app), "setEmpOrgMembership");
  var res = await fn({
    empId: empId,
    orgIds: normalizeOrgIds(orgIds, orgId),
  });
  return res.data || {};
}

/** @deprecated Khách hàng đã dùng chung — gọi migrateSharedCustomers nếu cần. */
async function copyCustomersToOrg(custIds, toOrg) {
  if (!app || !auth || !auth.currentUser) {
    throw new Error("Cần đăng nhập cloud.");
  }
  var fn = httpsCallable(getFunctions(app), "migrateSharedCustomers");
  var res = await fn({});
  return Object.assign({ ok: true, shared: true, copied: 0, skipped: true }, res.data || {}, {
    message: "Khách hàng đã dùng chung cả 2 đội — không cần sao chép.",
  });
}

async function runDualOrgMigration() {
  if (!app || !auth || !auth.currentUser) {
    throw new Error("Cần đăng nhập cloud.");
  }
  var fn = httpsCallable(getFunctions(app), "migrateDualOrgs");
  var res = await fn({});
  return res.data || {};
}

async function exportCompanyBackup() {
  if (!app || !auth || !auth.currentUser) {
    throw new Error("Cần đăng nhập cloud.");
  }
  var fn = httpsCallable(getFunctions(app), "exportCompanyBackup");
  var res = await fn({});
  return res.data || {};
}

async function restoreCompanyBackup(backup, targetOrg) {
  if (!app || !auth || !auth.currentUser) {
    throw new Error("Cần đăng nhập cloud.");
  }
  var fn = httpsCallable(getFunctions(app), "restoreCompanyBackup");
  var res = await fn({ backup: backup, targetOrg: targetOrg || orgId });
  return res.data || {};
}

function onOrgPartCardClick(ev) {
  var btn = ev.target && ev.target.closest ? ev.target.closest(".org-part-card") : null;
  if (!btn) return;
  var next = btn.getAttribute("data-org");
  if (!next) return;
  // Đang chuyển đúng đội này → bỏ qua; đội khác → queue trong switchOrg.
  if (switchingToOrg) {
    if (switchingToOrg === next) return;
  } else if (next === orgId) {
    return;
  }
  switchOrg(next).catch(function (err) {
    alert(err.message || "Không chuyển được phần.");
  });
}

function ensureOrgPartDelegation() {
  var partGrid = $("org-part-grid");
  if (!partGrid || partGrid._cv3OrgDelegated) return;
  partGrid._cv3OrgDelegated = true;
  partGrid.addEventListener("click", onOrgPartCardClick);
}

function refreshOrgSwitcherUI() {
  var wrap = $("hdr-org-switch");
  var partBar = $("org-part-bar");
  var partGrid = $("org-part-grid");
  var partSingle = $("org-part-single");
  var titleEl = $("hdr-title-text");
  var a = window.__CV3_AUTH;
  var orgs = listOrgs();

  function hideOrgChrome() {
    if (wrap) {
      wrap.style.display = "none";
      wrap.innerHTML = "";
    }
    if (partBar) {
      partBar.hidden = true;
      partBar.classList.remove("show");
    }
    if (partGrid) {
      partGrid.innerHTML = "";
      partGrid._cv3OrgSig = "";
    }
    if (partSingle) {
      partSingle.classList.remove("show");
      partSingle.innerHTML = "";
    }
    if (titleEl) titleEl.textContent = "QUẢN LÝ DỰ ÁN";
  }

  function setTitle(org) {
    if (!titleEl) return;
    var label = orgLabel(org || orgId);
    titleEl.textContent = "QUẢN LÝ DỰ ÁN · " + label.toUpperCase();
  }

  if (!a || !a.uid) {
    hideOrgChrome();
    return;
  }

  // Nhân viên thường: không hiện chú thích / chuyển phần Công trình tỉnh · HCM
  if (!showsOrgPartition()) {
    hideOrgChrome();
    return;
  }

  var allowed = authAllowedOrgIds(a, orgId);

  // Optimistic: hiện đội đích ngay khi đang chuyển (chưa commit orgId).
  var viewOrg = switchingToOrg || orgId;
  setTitle(viewOrg);

  // Header: luôn hiện nhãn đội đang xem (gọn)
  if (wrap) {
    wrap.style.display = "inline-flex";
    wrap.innerHTML =
      '<span class="hdr-org-label" title="Phần đang xem">' +
      escHtml(orgLabel(viewOrg)) +
      "</span>";
  }

  // Một đội: banner nhỏ
  if (allowed.length < 2) {
    if (partBar) {
      partBar.hidden = true;
      partBar.classList.remove("show");
      if (partGrid) partGrid.innerHTML = "";
    }
    if (partSingle) {
      partSingle.classList.add("show");
      partSingle.innerHTML = escHtml(orgLabel(viewOrg));
    }
    return;
  }

  // Hai đội: 2 phần riêng, bấm vào để vào phần đó
  if (partSingle) {
    partSingle.classList.remove("show");
    partSingle.innerHTML = "";
  }
  if (!partBar || !partGrid) return;
  partBar.hidden = false;
  partBar.classList.add("show");
  ensureOrgPartDelegation();
  var sig =
    allowed.slice().sort().join(",") +
    "|" +
    viewOrg +
    "|" +
    (switchingToOrg || "");
  if (partGrid._cv3OrgSig === sig && partGrid.querySelector(".org-part-card")) {
    // Cập nhật trạng thái chọn mà không thay innerHTML (tránh nuốt click)
    partGrid.querySelectorAll(".org-part-card").forEach(function (btn) {
      var id = btn.getAttribute("data-org");
      var on = id === viewOrg;
      var busy = switchingToOrg === id;
      btn.classList.toggle("on", on);
      btn.classList.toggle("is-switching", !!switchingToOrg);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      // Không dùng disabled — click không bubble → mất queue đổi đội.
      if (busy) btn.setAttribute("aria-busy", "true");
      else btn.removeAttribute("aria-busy");
      var kicker = btn.querySelector(".org-part-card-kicker");
      if (kicker) {
        kicker.textContent = busy
          ? "Đang chuyển…"
          : on
            ? "Đang xem"
            : "Chuyển sang";
      }
    });
    return;
  }
  var h = "";
  orgs.forEach(function (o) {
    if (allowed.indexOf(o.id) < 0) return;
    var on = o.id === viewOrg;
    var busy = switchingToOrg === o.id;
    h +=
      '<button type="button" class="org-part-card' +
      (on ? " on" : "") +
      (switchingToOrg ? " is-switching" : "") +
      '" data-org="' +
      escHtml(o.id) +
      '" aria-pressed="' +
      (on ? "true" : "false") +
      '"' +
      (busy ? ' aria-busy="true"' : "") +
      ">" +
      '<div class="org-part-card-kicker">' +
      (busy ? "Đang chuyển…" : on ? "Đang xem" : "Chuyển sang") +
      "</div>" +
      '<div class="org-part-card-title">' +
      escHtml(o.label) +
      "</div></button>";
  });
  partGrid.innerHTML = h;
  partGrid._cv3OrgSig = sig;
}

function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function switchOrg(nextOrg) {
  var next = normalizeOrgId(nextOrg);
  var a = window.__CV3_AUTH || {};
  var allowed = authAllowedOrgIds(a, orgId);
  if (allowed.indexOf(next) < 0) {
    throw new Error("Tài khoản không thuộc đội " + orgLabel(next) + ".");
  }
  if (next === orgId && !switchingToOrg) return;
  // Đang chuyển đội khác → xếp hàng mục tiêu mới nhất
  if (switchingToOrg) {
    pendingSwitchOrg = next;
    return;
  }
  switchingToOrg = next;
  pendingSwitchOrg = null;
  writeQueued = false;
  var prevOrg = orgId;
  var gen = ++orgSwitchGen;
  refreshOrgSwitcherUI();
  setSync("syncing", "Đang chuyển sang " + orgLabel(next) + "…");

  try {
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
    // Chờ ghi đang chạy (không bỏ qua — trước đây return sớm khi writing=true).
    if (writePromise) {
      try {
        await writePromise;
      } catch (e0) {}
    } else if (appCv3 && canOperateRole() && booted && prevOrg !== next) {
      // Chỉ flush workspace đội cũ — bỏ vòng upsert emp/cust (chậm, không cần khi đổi đội).
      try {
        await flushWrite(appCv3, {
          workspaceOnly: true,
          orgId: prevOrg,
        });
      } catch (e1) {}
    }
    if (gen !== orgSwitchGen) return;

    // Hủy listener đội cũ TRƯỚC khi đổi orgId — tránh applyRemote stale.
    if (appCv3) {
      if (unsubSnap) unsubSnap();
      unsubSnap = null;
      unsubChatAll();
      if (unsubReports) unsubReports();
      unsubReports = null;
      if (unsubReportsOther) unsubReportsOther();
      unsubReportsOther = null;
      if (unsubAttendance) unsubAttendance();
      unsubAttendance = null;
      if (unsubOtherSnap) unsubOtherSnap();
      unsubOtherSnap = null;
    }

    orgId = next;
    remotePatch = 0;
    booted = false;
    forceWorkspaceApply = true;
    try {
      localStorage.setItem("cv3_active_org", orgId);
    } catch (e) {}
    if (a.uid) {
      publishAuth(
        Object.assign({}, a, {
          orgId: orgId,
          orgIds: allowed,
        })
      );
    }
    refreshOrgSwitcherUI();

    if (auth && auth.currentUser && db) {
      setDoc(
        doc(db, "users", auth.currentUser.uid),
        { activeOrgId: orgId, orgId: orgId, updatedAt: serverTimestamp() },
        { merge: true }
      ).catch(function (err) {
        console.warn("activeOrgId:", err);
      });
    }

    if (appCv3 && typeof appCv3.prepareOrgWorkspace === "function") {
      appCv3.prepareOrgWorkspace();
    } else if (appCv3 && appCv3.S) {
      appCv3.S.modal = null;
      appCv3.S.form = null;
      appCv3.S.selProj = "";
      appCv3.S.selProjDet = "";
      appCv3.S.selEmp = "";
      appCv3.S.selCust = "";
      appCv3.S.giaoProj = "";
      appCv3.S.reports = [];
      appCv3.S.attendance = [];
      appCv3.S._reportsSig = "";
      appCv3.S._attSig = "";
      appCv3.S.proj = [];
      appCv3.S.asgn = [];
      appCv3.S.projLog = [];
      appCv3.S.asgnOther = [];
      appCv3.S.projOther = [];
      appCv3.S.otherOrgId = "";
      if (typeof appCv3.render === "function") appCv3.render();
    }
    if (appCv3) {
      historyRangeCache = Object.create(null);
      liveHistorySince = "";
      subscribeWorkspace(appCv3, { skipMasters: true });
      subscribeChat();
      subscribeReports();
      subscribeAttendance();
    }
    setSync("syncing", "Đang tải phần " + orgLabel(orgId) + "…");
  } finally {
    if (gen === orgSwitchGen) {
      switchingToOrg = null;
      refreshOrgSwitcherUI();
    }
    if (pendingSwitchOrg && pendingSwitchOrg !== orgId) {
      var queued = pendingSwitchOrg;
      pendingSwitchOrg = null;
      switchOrg(queued).catch(function (err) {
        console.warn("queued switchOrg:", err);
      });
    }
  }
}

function maybeRefreshEmpGroup(cv3) {
  var a = window.__CV3_AUTH;
  if (!a || a.role !== "employee" || !a.empId || !cv3 || !cv3.S) return;
  var pool = cv3.S.empAll || cv3.S.emp || [];
  var e = pool.find(function (x) {
    return x && x.id === a.empId;
  });
  var g = e && e.group ? e.group : "";
  if (g && g !== a.empGroup) {
    syncEmpGroupToUserDoc(a.empId, g);
  }
}

async function ensureUserDoc(user, org, username, preset) {
  var ref = doc(db, "users", user.uid);
  var snap = await getDoc(ref);
  var un = username || user.displayName || emailToUsername(user.email);
  var chosenOrg = normalizeOrgId(org || defaultOrg);
  var role, empId, displayName, age, orgIds, empGroup;
  if (!snap.exists()) {
    var acct = preset || null;
    if (!acct) {
      try {
        acct = await resolveAccount(un, chosenOrg);
      } catch (e) {
        if (e && e.code === "auth/unknown-employee") {
          acct = {
            role: "employee",
            empId: "",
            orgIds: [chosenOrg],
            empGroup: "",
          };
        } else throw e;
      }
    }
    role = acct.role || "employee";
    empId = acct.empId || "";
    displayName = user.displayName || "";
    age = null;
    orgIds =
      role === "director"
        ? allOrgIds()
        : normalizeOrgIds(acct.orgIds, chosenOrg);
    empGroup = acct.empGroup || "";
    orgIds = forceChiefOrgIds(empGroup, orgIds, chosenOrg);
    if (empGroup === CHIEF_GROUP) chosenOrg = CHIEF_ORG_ID;
    if (orgIds.indexOf(chosenOrg) < 0) chosenOrg = orgIds[0] || chosenOrg;
    await setDoc(ref, {
      username: un,
      orgId: chosenOrg,
      orgIds: orgIds,
      activeOrgId: chosenOrg,
      role: role,
      empId: empId || "",
      empGroup: empGroup || "",
      displayName: displayName,
      age: age,
      createdAt: serverTimestamp(),
    });
    orgId = chosenOrg;
  } else {
    var d = snap.data();
    role = d.role || "employee";
    empId = d.empId || null;
    displayName = d.displayName || user.displayName || "";
    age = d.age != null ? d.age : null;
    empGroup = d.empGroup || "";
    orgIds = normalizeOrgIds(d.orgIds, d.orgId || chosenOrg);
    if (role === "director" && orgIds.length < 2) {
      orgIds = allOrgIds();
    }
    orgIds = forceChiefOrgIds(empGroup, orgIds, chosenOrg);
    // Đội làm việc lấy từ hồ sơ (activeOrgId / orgIds), không từ form đăng nhập
    if (d.activeOrgId && orgIds.indexOf(normalizeOrgId(d.activeOrgId)) >= 0) {
      orgId = normalizeOrgId(d.activeOrgId);
    } else if (d.orgId && orgIds.indexOf(normalizeOrgId(d.orgId)) >= 0) {
      orgId = normalizeOrgId(d.orgId);
    } else {
      orgId = orgIds[0] || chosenOrg;
    }
    var patch = {
      orgId: orgId,
      orgIds: orgIds,
      activeOrgId: orgId,
    };
    if (!d.username && un) patch.username = un;
    if (role === "employee" && un) {
      try {
        var acct2 = await resolveAccount(un, orgId);
        if (acct2 && acct2.empId && acct2.empId !== empId) {
          empId = acct2.empId;
          patch.empId = empId;
        }
        if (acct2 && acct2.orgIds && acct2.orgIds.length) {
          orgIds = normalizeOrgIds(acct2.orgIds, orgId);
          patch.orgIds = orgIds;
          if (orgIds.indexOf(orgId) < 0) {
            orgId = orgIds[0];
            patch.orgId = orgId;
            patch.activeOrgId = orgId;
          }
        }
        if (acct2 && acct2.empGroup) {
          empGroup = acct2.empGroup;
          patch.empGroup = empGroup;
        }
        orgIds = forceChiefOrgIds(empGroup, orgIds, orgId);
        if (empGroup === CHIEF_GROUP) {
          orgId = CHIEF_ORG_ID;
          patch.orgId = orgId;
          patch.activeOrgId = orgId;
          patch.orgIds = orgIds;
        }
      } catch (e) {
        console.warn("Could not re-resolve account", e);
      }
    }
    await setDoc(ref, patch, { merge: true });
  }
  if (role === "employee" && empId && appCv3 && appCv3.S) {
    var pool = appCv3.S.empAll || appCv3.S.emp || [];
    var empRow = pool.find(function (x) {
      return x && x.id === empId;
    });
    if (empRow && empRow.group) empGroup = empRow.group;
  }
  if (role === "employee" && empId) {
    await setDoc(
      ref,
      { empId: empId, empGroup: empGroup || "" },
      { merge: true }
    );
  }
  try {
    localStorage.setItem("cv3_active_org", orgId);
  } catch (e) {}
  publishAuth({
    role: role,
    empId: empId,
    empGroup: empGroup,
    username: un,
    uid: user.uid,
    displayName: displayName,
    age: age,
    orgId: orgId,
    orgIds: orgIds,
  });
  if (empId && appCv3 && appCv3.linkEmpAuth) {
    appCv3.linkEmpAuth(empId, user.uid);
  }
  refreshOrgSwitcherUI();
  return {
    role: role,
    empId: empId,
    empGroup: empGroup,
    username: un,
    displayName: displayName,
    age: age,
    orgId: orgId,
    orgIds: orgIds,
  };
}

function scheduleWrite(cv3) {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(function () {
    writeTimer = null;
    flushWrite(cv3).catch(function (err) {
      console.warn("flushWrite:", err);
    });
  }, 450);
}

async function flushWrite(cv3, opts) {
  opts = opts || {};
  if (!auth || !auth.currentUser) return;
  if (!canOperateRole()) return;
  var intendedOrg = normalizeOrgId(opts.orgId || orgId);
  var intendedGen = orgSwitchGen;
  // Đang ghi: switchOrg / force chờ xong; scheduleWrite thường chỉ xếp hàng 1 lần.
  if (writing && writePromise) {
    if (opts.orgId || opts.force || opts.onlyWait || opts.workspaceOnly) {
      try {
        await writePromise;
      } catch (e0) {}
      if (opts.onlyWait) return;
    } else {
      writeQueued = true;
      return;
    }
  }
  if (writing) return;
  // Sau khi chờ: đã đổi đội → đừng ghi nhầm (trừ flush tường minh opts.orgId của đội cũ).
  if (!opts.orgId && (orgId !== intendedOrg || orgSwitchGen !== intendedGen)) return;
  if (switchingToOrg && !opts.orgId) return;
  // Chưa boot xong workspace (sau đổi đội) thì không ghi — trừ force / workspaceOnly khi flush đội cũ.
  if (!booted && !opts.force && !opts.workspaceOnly) return;
  var writeOrg = opts.orgId ? normalizeOrgId(opts.orgId) : orgId;
  var localPatch = cv3.getPatch();
  // Patch local bị tụt (đổi đội / cache) so với cloud → bắt kịp rồi ghi, không bỏ qua thầm lặng
  if (localPatch <= remotePatch) {
    localPatch = remotePatch + 1;
    if (cv3.setPatch) cv3.setPatch(localPatch);
  }
  writing = true;
  setSync("syncing", "Đang lưu lên cloud…");
  writePromise = (async function () {
    try {
      var payload = payloadFromApp(cv3, writeOrg);
      payload.patch = localPatch;
      await setDoc(workspaceRef(writeOrg), payload, { merge: false });
      if (!opts.workspaceOnly) {
        try {
          await syncMastersFromApp(cv3);
        } catch (errMaster) {
          console.warn("syncMastersFromApp:", errMaster);
        }
      }
      // Chỉ cập nhật remotePatch nếu vẫn đang xem đúng đội vừa ghi
      if (writeOrg === orgId) remotePatch = localPatch;
      setSync("online", "Đồng bộ · " + orgLabel(orgId));
      if (!opts.workspaceOnly && countEmpNeedingAuth(cv3)) scheduleProvision(cv3);
    } catch (err) {
      console.error(err);
      setSync("error", "Lỗi lưu cloud");
    } finally {
      writing = false;
      writePromise = null;
      flushPendingMasterUi(cv3);
      if (writeQueued && !switchingToOrg) {
        writeQueued = false;
        scheduleWrite(cv3);
      } else {
        writeQueued = false;
      }
    }
  })();
  await writePromise;
}

function subscribeWorkspace(cv3, opts) {
  opts = opts || {};
  if (unsubSnap) unsubSnap();
  if (!opts.skipMasters) {
    subscribeEmpMaster(cv3);
    subscribeCustMaster(cv3);
  }
  subscribeOtherOrgAsgn(cv3);
  setSync("syncing", "Đang tải dữ liệu…");
  var subscribedOrg = orgId;
  var subscribedGen = orgSwitchGen;
  unsubSnap = onSnapshot(
    workspaceRef(subscribedOrg),
    function (snap) {
      if (orgId !== subscribedOrg || orgSwitchGen !== subscribedGen) return;
      if (!snap.exists()) {
        if (!booted) {
          booted = true;
          forceWorkspaceApply = false;
          if (cv3.S) {
            cv3.S.proj = [];
            cv3.S.asgn = [];
            cv3.S.projLog = [];
            cv3.S.reminders = [];
            cv3.S.auditLog = [];
            cv3.S.trash = [];
          }
          if (cv3.setPatch) cv3.setPatch(0);
          cv3.render();
          flushWrite(cv3, { force: true }).then(function () {
            if (canOperateRole()) scheduleProvision(cv3);
          });
        }
        setSync("online", "Cloud mới · " + orgLabel(orgId));
        return;
      }
      var data = snap.data();
      var changed = applyRemote(cv3, data);
      if (!booted) {
        booted = true;
        cv3.render();
      } else if (changed) {
        cv3.render();
      }
      if (data.patch != null && data.patch > remotePatch) remotePatch = data.patch;
      var who = auth && auth.currentUser ? userLabel(auth.currentUser) : "";
      setSync("online", (who ? who + " · " : "") + "đồng bộ · " + orgLabel(orgId));
      // Chỉ provision khi còn nhân viên thiếu tài khoản — tránh gọi lặp mỗi snapshot.
      if (canOperateRole() && !provisionDone && countEmpNeedingAuth(cv3)) {
        scheduleProvision(cv3);
      }
    },
    function (err) {
      if (orgId !== subscribedOrg || orgSwitchGen !== subscribedGen) return;
      console.error(err);
      setSync("error", "Mất kết nối cloud");
    }
  );
}

async function persistFcmToken(token, cv3) {
  if (!auth || !auth.currentUser || !db) return;
  if (isDirectorRole()) {
    await setDoc(
      doc(db, "users", auth.currentUser.uid),
      { fcmToken: token, empId: "" },
      { merge: true }
    );
    try {
      var fnDir = httpsCallable(getFunctions(app), "syncFcmToken");
      await fnDir({ token: token });
    } catch (err) {
      console.warn("syncFcmToken:", err);
    }
    return;
  }
  var linked = localStorage.getItem("cv3_fcm_emp");
  var empId = (window.__CV3_AUTH && window.__CV3_AUTH.empId) || linked;
  if (empId && cv3) cv3.linkFcmToEmp(empId, token);
  await saveMyFcmToken(token, empId || "");
  try {
    var fn = httpsCallable(getFunctions(app), "syncFcmToken");
    await fn({ token: token });
  } catch (err) {
    console.warn("syncFcmToken:", err);
  }
}

function notifyAudienceRole() {
  if (isDirectorRole()) return "director";
  var g = authEmpGroup();
  if (g === "Điều hành") return "operate";
  if (g === "Giám sát" || g === "Quản lý") return "supervise";
  if (g === CHIEF_GROUP) return "chief";
  return "employee";
}

/**
 * Client-side mirror of Cloud Functions role rules for foreground toast/Notification.
 * Server remains source of truth for FCM delivery; this guards leftover/wrong payloads.
 */
function shouldShowPushNotification(type, d) {
  d = d || {};
  var aud = notifyAudienceRole();
  var me = (auth && auth.currentUser && auth.currentUser.uid) || "";
  var myEmp =
    (window.__CV3_AUTH && window.__CV3_AUTH.empId) ||
    (appCv3 && appCv3.S && appCv3.S.auth && appCv3.S.auth.empId) ||
    "";

  if (type === "arrival") {
    if (!myEmp) return false;
    if (d.empId && String(d.empId) !== String(myEmp)) return false;
    return aud === "employee" || !!myEmp;
  }
  if (type === "reminder") {
    return aud === "director" || aud === "operate" || aud === "supervise" || aud === "chief";
  }
  if (type === "chat") {
    var isBc = d.chatType === "broadcast" || d.threadId === "broadcast";
    if (d.fromUid && me && d.fromUid === me) return false;
    if (isBc) return aud !== "employee";
    // DM: recipient always; DH/GS get company copies; GD only if addressed to them
    if (aud === "employee" || aud === "chief") {
      return !d.toUid || d.toUid === me;
    }
    if (aud === "director") {
      return !d.toUid || d.toUid === me;
    }
    return true;
  }
  if (type === "assignment" || type === "schedule") {
    if (aud === "employee" || aud === "chief") {
      return !d.empId || String(d.empId) === String(myEmp);
    }
    if (aud === "supervise") return true;
    if (aud === "operate") {
      if (d.assignedByUid && me && d.assignedByUid === me) return false;
      return true;
    }
    // director: not staff-targeted copies
    return false;
  }
  return true;
}

function bindForegroundMessaging(messaging, cv3) {
  if (!messaging || messaging.__cv3Bound) return;
  messaging.__cv3Bound = true;
  onMessage(messaging, function (payload) {
    var type = payload.data && payload.data.type;
    var d = payload.data || {};
    if (type && !shouldShowPushNotification(type, d)) {
      if (cv3 && typeof cv3.syncAppBadge === "function") cv3.syncAppBadge();
      return;
    }
    if (type === "reminder" && cv3 && typeof cv3.onReminderPush === "function") {
      cv3.onReminderPush(payload);
      return;
    }
    if (type === "arrival" && cv3 && typeof cv3.onArrivalPush === "function") {
      cv3.onArrivalPush(payload);
      return;
    }
    if (type === "chat") {
      // Chỉ người nhận DM mới ghi receipt; fan-out DH/GS không đụng deliveredAt
      if (
        d.msgId &&
        d.chatType !== "broadcast" &&
        (!d.toUid || (auth && auth.currentUser && d.toUid === auth.currentUser.uid))
      ) {
        markMessageDelivered(d.msgId);
      }
      var titleC = d.title || "Tin nhắn mới";
      var bodyC = d.body || "";
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(titleC, {
            body: bodyC,
            icon: "/icon-192.png",
            tag: "chat_" + (d.msgId || "fg"),
            silent: false,
          });
        } catch (e) {}
      }
      if (cv3 && typeof cv3.showAppToast === "function") {
        cv3.showAppToast(titleC + (bodyC ? " — " + bodyC : ""), "ok");
      }
      if (cv3 && typeof cv3.syncAppBadge === "function") cv3.syncAppBadge();
      return;
    }
    if (type === "assignment" && cv3) {
      var myEmpAck =
        (window.__CV3_AUTH && window.__CV3_AUTH.empId) ||
        (appCv3 && appCv3.S && appCv3.S.auth && appCv3.S.auth.empId) ||
        "";
      if (
        d.asgnId &&
        myEmpAck &&
        (!d.empId || String(d.empId) === String(myEmpAck))
      ) {
        ackAssignment(d.asgnId, "delivered");
      }
      var title = d.title || "Công việc mới";
      var body = d.body || "";
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(title, {
            body: body,
            icon: "/icon-192.png",
            tag: "asgn_" + (d.asgnId || "fg"),
            silent: false,
          });
        } catch (e) {}
      }
      if (typeof cv3.showAppToast === "function") {
        cv3.showAppToast(title + (body ? " — " + body : ""), "ok");
      }
      if (typeof cv3.syncAppBadge === "function") cv3.syncAppBadge();
      return;
    }
    if (type === "schedule" && cv3) {
      var titleS = d.title || "Lịch công việc đã điều chỉnh";
      var bodyS = d.body || "";
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(titleS, {
            body: bodyS,
            icon: "/icon-192.png",
            tag: "sched_" + (d.asgnId || "fg"),
            silent: false,
          });
        } catch (e) {}
      }
      if (typeof cv3.showAppToast === "function") {
        cv3.showAppToast(titleS + (bodyS ? " — " + bodyS : ""), "ok");
      }
      if (typeof cv3.syncAppBadge === "function") cv3.syncAppBadge();
    }
  });
}

function fcmFailReason(err) {
  if (!err) return "unknown";
  var code = String(err.code || "");
  var msg = String(err.message || err);
  var low = (code + " " + msg).toLowerCase();
  if (low.indexOf("permission") >= 0 || low.indexOf("not granted") >= 0) return "denied";
  if (low.indexOf("unsupported") >= 0) return "unsupported";
  if (low.indexOf("service worker") >= 0 || low.indexOf("serviceworker") >= 0) return "sw-fail";
  if (low.indexOf("vapid") >= 0) return "no-config";
  if (code === "messaging/token-subscribe-failed") return "no-token";
  if (!window.isSecureContext) return "insecure";
  return msg.slice(0, 160) || "unknown";
}

async function registerMessaging(cv3, options) {
  var opts = options || {};
  if (isLocalDevHost() && !opts.request) {
    return { ok: false, reason: "local-dev" };
  }
  var key =
    (window.__CV3 && typeof window.__CV3.getVapidKey === "function"
      ? window.__CV3.getVapidKey()
      : null) || vapidKey;
  if (!configured || !key || key === "YOUR_VAPID_KEY") return { ok: false, reason: "no-config" };
  if (typeof Notification === "undefined") return { ok: false, reason: "unsupported" };
  if (!window.isSecureContext) return { ok: false, reason: "insecure" };
  var ok = await isSupported();
  if (!ok) return { ok: false, reason: "unsupported" };
  try {
    if (!("serviceWorker" in navigator)) return { ok: false, reason: "unsupported" };
    // Always re-register so SW updates (cache-bust query); scope must stay "/".
    var reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js?v=2", {
      scope: "/",
      updateViaCache: "none",
    });
    try {
      if (reg.update) await reg.update();
    } catch (eUp) {}
    await navigator.serviceWorker.ready;
    if (reg.installing) {
      await new Promise(function (resolve) {
        var w = reg.installing;
        if (!w) return resolve();
        w.addEventListener("statechange", function () {
          if (w.state === "activated" || w.state === "redundant") resolve();
        });
        setTimeout(resolve, 4000);
      });
    }
    var messaging = getMessaging(app);
    var perm = Notification.permission;
    if (perm !== "granted") {
      if (!opts.request) return { ok: false, reason: "denied" };
      perm = await Notification.requestPermission();
    }
    if (perm !== "granted") return { ok: false, reason: "denied" };
    var token = await getToken(messaging, { vapidKey: key, serviceWorkerRegistration: reg });
    if (!token) return { ok: false, reason: "no-token" };
    pushReady = true;
    window.__CV3_FCM = { token: token, messaging: messaging };
    localStorage.setItem("cv3_push_enabled", "1");
    await persistFcmToken(token, cv3);
    if (isDirectorRole()) localStorage.setItem("cv3_remind_push", "1");
    bindForegroundMessaging(messaging, cv3);
    return { ok: true, token: token };
  } catch (err) {
    console.warn("FCM:", err);
    return { ok: false, reason: fcmFailReason(err) };
  }
}

function authErrMsg(err, mode, isBootstrap) {
  var c = (err && err.code) || "";
  if (c === "auth/user-not-found" && mode === "login" && isBootstrap)
    return "Chưa có tài khoản — nếu là lần đầu, bấm «Thiết lập lần đầu» rồi tự đặt mật khẩu.";
  if (
    (c === "auth/invalid-credential" || c === "auth/wrong-password") &&
    mode === "login" &&
    isBootstrap
  )
    return "Mật khẩu không đúng. Nếu chưa từng đăng ký, bấm «Thiết lập lần đầu».";
  if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found")
    return mode === "login"
      ? "Tên đăng nhập hoặc mật khẩu không đúng. Liên hệ giám đốc nếu chưa có tài khoản."
      : "Không đăng nhập được. Kiểm tra tên và mật khẩu.";
  if (c === "auth/email-already-in-use" && mode === "signup")
    return "Tên đăng nhập đã có người dùng — hãy đăng nhập hoặc chọn tên khác.";
  if (c === "auth/email-already-in-use")
    return "Tên đăng nhập đã có người dùng trong đội này — hãy đăng nhập hoặc chọn tên khác.";
  if (c === "auth/weak-password") return "Mật khẩu quá yếu — cần ít nhất 6 ký tự.";
  if (c === "auth/invalid-email" || c === "auth/invalid-username")
    return "Tên đăng nhập không hợp lệ — dùng chữ, số, dấu chấm hoặc gạch dưới.";
  if (c === "auth/unknown-employee") return err.message || "Tên chưa có trong danh sách nhân sự.";
  if (c === "auth/employee-signup-blocked") return err.message || "Nhân viên không tự đăng ký.";
  if (c === "auth/employee-taken") return err.message || "Tài khoản nhân viên này đã được tạo.";
  if (c === "auth/bootstrap-blocked") return err.message || "Đội đã có giám đốc — không thể tự đăng ký.";
  if (c === "auth/too-many-requests") return "Thử quá nhiều lần — đợi vài phút rồi thử lại.";
  if (c === "auth/wrong-org") return err.message || "Tài khoản không thuộc đội này.";
  if (c === "functions/failed-precondition") return (err && err.message) || "Không thể thiết lập giám đốc.";
  return (err && err.message) || String(err);
}

function isRetryableAuthCredentialError(err) {
  var c = (err && err.code) || "";
  return (
    c === "auth/user-not-found" ||
    c === "auth/invalid-credential" ||
    c === "auth/wrong-password" ||
    c === "auth/invalid-email"
  );
}

async function signInWithIdentity(id, pass) {
  try {
    return await signInWithEmailAndPassword(auth, id.email, pass);
  } catch (err) {
    if (!isRetryableAuthCredentialError(err)) throw err;
    var candidates = id.legacyEmails;
    if (!candidates || !candidates.length) {
      candidates = id.legacyEmail ? [id.legacyEmail] : [];
    }
    var lastErr = err;
    for (var i = 0; i < candidates.length; i++) {
      try {
        return await signInWithEmailAndPassword(auth, candidates[i], pass);
      } catch (e2) {
        lastErr = e2;
        if (!isRetryableAuthCredentialError(e2)) throw e2;
      }
    }
    throw lastErr;
  }
}

function bindAuthUI(cv3) {
  var form = $("auth-form");
  if (!form) return;
  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var userInput = ($("auth-user") || {}).value.trim();
    var pass = ($("auth-pass") || {}).value;
    var org = defaultOrg;
    var errEl = $("auth-err");
    var mode = form.dataset.mode || "login";
    if (errEl) errEl.textContent = "";
    try {
      var id = resolveAuthIdentity(userInput);
      var signedUser = null;
      if (mode === "signup") {
        var hasDir = await hasDirectorInOrg(org);
        if (hasDir) {
          throw Object.assign(
            new Error(
              "Công ty đã có giám đốc — nhân viên không tự đăng ký. Liên hệ giám đốc để được cấp tài khoản."
            ),
            { code: "auth/bootstrap-blocked" }
          );
        }
        if (id.username.length < 2) {
          throw Object.assign(new Error("Tên đăng nhập cần ít nhất 2 ký tự."), {
            code: "auth/invalid-username",
          });
        }
        var cred = await createUserWithEmailAndPassword(auth, id.email, pass);
        orgId = org;
        await updateProfile(cred.user, { displayName: "Giám đốc" });
        await claimDirectorRole(id.username, org);
        await ensureUserDoc(cred.user, org, id.username, {
          role: "director",
          empId: "",
          orgIds: allOrgIds(),
        });
        signedUser = cred.user;
      } else {
        var lc = await signInWithIdentity(id, pass);
        await ensureUserDoc(lc.user, null, id.username);
        signedUser = lc.user;
      }
      showAuth(false);
      if (mode !== "signup") {
        setTimeout(function () {
          syncOrOfferBiometric(id.username, pass, signedUser);
        }, 400);
      }
    } catch (err) {
      var bootstrapMode = (form.dataset.mode || "login") === "signup";
      if (errEl) errEl.textContent = authErrMsg(err, form.dataset.mode || "login", bootstrapMode);
      var c = (err && err.code) || "";
      var showForgot =
        bootstrapMode &&
        (c === "auth/email-already-in-use" ||
          c === "auth/invalid-credential" ||
          c === "auth/wrong-password" ||
          c === "auth/user-not-found");
      showDirectorForgotHint(showForgot);
    }
  });

  var btnLogin = $("auth-login-mode");
  if (btnLogin) btnLogin.addEventListener("click", switchToLoginMode);

  var btnBio = $("auth-bio-btn");
  if (btnBio) btnBio.addEventListener("click", loginWithBiometric);

  var btnOut = $("auth-signout");
  var btnIn = $("auth-signin");
  if (btnIn) btnIn.addEventListener("click", openAuthPanel);
  if (btnOut) btnOut.addEventListener("click", doSignOut);
  window.__CV3_signOut = doSignOut;
  window.__CV3_bio = {
    status: getBiometricStatus,
    available: isBiometricAvailable,
    enabled: isBiometricEnabled,
    enable: enableBiometricForCurrentUser,
    disable: disableBiometric,
    login: loginWithBiometric,
    refreshLoginUI: refreshBiometricLoginUI,
  };
  refreshBiometricLoginUI();
}

async function maybeSuggestMigration(cv3) {
  if (!db || !isDirectorRole()) return;
  try {
    var ct = await getDoc(doc(db, "workspaces", "cong-trinh", "data", "main"));
    var saree = await getDoc(doc(db, "workspaces", "saree", "data", "main"));
    var ctEmpty =
      !ct.exists() ||
      !(
        (ct.data().emp || []).length ||
        (ct.data().proj || []).length ||
        (ct.data().asgn || []).length ||
        (ct.data().cust || []).length
      );
    if (saree.exists() && ctEmpty) {
      var ok = confirm(
        "Phát hiện dữ liệu đội cũ (saree). Chạy migration sang 2 đội (Công trình tỉnh / Công trình HCM) ngay bây giờ?"
      );
      if (ok) {
        var res = await runDualOrgMigration();
        alert((res && res.message) || "Migration xong.");
        location.reload();
      }
      return;
    }
    var wsCustCount = 0;
    if (ct.exists()) wsCustCount += (ct.data().cust || []).length;
    if (saree.exists()) wsCustCount += (saree.data().cust || []).length;
    var sharedCustCount = Object.keys(custMasterById).length;
    if (!sharedCustCount) {
      try {
        var snap = await getDocs(custMasterColRef());
        sharedCustCount = snap.size;
      } catch (e) {}
    }
    if (wsCustCount && !sharedCustCount) {
      var ok2 = confirm(
        "Phát hiện khách hàng còn trong workspace — chuyển sang danh sách dùng chung cả 2 đội?"
      );
      if (ok2) {
        var fn = httpsCallable(getFunctions(app), "migrateSharedCustomers");
        var r2 = await fn({});
        alert((r2.data && r2.data.message) || "Đã chuyển khách hàng dùng chung.");
        location.reload();
      }
    }
  } catch (err) {
    console.warn("maybeSuggestMigration:", err);
  }
}

async function bootOffline(cv3) {
  setSync("offline", "Chỉ lưu trên máy này");
  cv3.finishBoot();
}

async function bootOnline(cv3) {
  await clearLocalServiceWorkers();
  bindAuthUI(cv3);
  cv3.setSvHook(function () {
    scheduleWrite(cv3);
  });
  window.__CV3_enablePush = function (empId) {
    localStorage.setItem("cv3_fcm_emp", empId || "");
    return registerMessaging(cv3, { request: true }).then(function (res) {
      if (!res || !res.ok) return res || { ok: false, reason: "unknown" };
      var token = res.token || (window.__CV3_FCM && window.__CV3_FCM.token);
      if (!token) return { ok: false, reason: "no-token" };
      cv3.linkFcmToEmp(empId, token);
      return persistFcmToken(token, cv3).then(function () {
        return { ok: true, token: token };
      });
    });
  };
  window.__CV3_enableRemindPush = function () {
    return registerMessaging(cv3, { request: true });
  };
  window.__CV3_flushCloud = function () {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = null;
    return flushWrite(cv3);
  };
  window.__CV3_provisionEmp = provisionEmployeeAccount;
  window.__CV3_provisionAllEmployees = function (force) {
    return provisionAllEmployees(cv3, { force: !!force });
  };
  window.__CV3_changePassword = changeMyPassword;
  window.__CV3_updateProfile = updateMyProfile;
  window.__CV3_updateUsername = updateMyUsername;
  window.__CV3_submitReport = callSubmitReport;
  window.__CV3_submitAttendance = callSubmitAttendance;
  window.__CV3_confirmArrival = callConfirmArrival;
  window.__CV3_ensureAttendanceRange = ensureAttendanceRange;
  window.__CV3_ensureAttendanceMonth = ensureAttendanceMonth;
  window.__CV3_ensureReportsRange = ensureReportsRange;
  window.__CV3_historyWindowDays = function () {
    return HISTORY_WINDOW_DAYS;
  };
  window.__CV3_switchOrg = switchOrg;
  window.__CV3_getOrgId = function () {
    return orgId;
  };
  window.__CV3_getRemotePatch = function () {
    return remotePatch || 0;
  };
  window.__CV3_listOrgs = listOrgs;
  window.__CV3_orgLabel = orgLabel;
  window.__CV3_otherOrgId = otherOrgId;
  window.__CV3_setEmpOrgMembership = setEmpOrgMembership;
  window.__CV3_copyCustomersToOrg = copyCustomersToOrg;
  window.__CV3_migrateDualOrgs = runDualOrgMigration;
  window.__CV3_exportCompanyBackup = exportCompanyBackup;
  window.__CV3_restoreCompanyBackup = restoreCompanyBackup;
  window.__CV3_upsertEmpMaster = upsertEmpToMaster;
  window.__CV3_upsertCustMaster = upsertCustToMaster;
  window.__CV3_deleteCustMaster = deleteCustFromMaster;
  onAuthStateChanged(auth, async function (user) {
    var epoch = ++authEpoch;
    var uid = user ? user.uid : null;
    updateAuthButtons(user);
    if (!user) {
      stopSubscriptions();
      publishAuth(null);
      refreshOrgSwitcherUI();
      if (authOverlayVisible !== true) switchToLoginMode();
      showAuth(true);
      refreshBootstrapUI();
      setSync("offline", "Chưa đăng nhập cloud — bấm Đăng nhập");
      return;
    }
    if (uid === lastAuthUid && booted) {
      showAuth(false);
      refreshOrgSwitcherUI();
      return;
    }
    showAuth(false);
    var who = userLabel(user);
    var roleLbl =
      window.__CV3_AUTH && window.__CV3_AUTH.role === "director"
        ? "Giám đốc"
        : who;
    setSync("syncing", roleLbl ? "Xin chào " + roleLbl + "…" : "Đang tải dữ liệu…");
    try {
      await ensureUserDoc(user, null, who);
    } catch (err) {
      console.error("ensureUserDoc:", err);
      if (epoch !== authEpoch) return;
      publishAuth(null);
      if (authOverlayVisible !== true) switchToLoginMode();
      showAuth(true);
      setSync("error", "Không tải được hồ sơ đăng nhập");
      return;
    }
    if (epoch !== authEpoch) return;
    lastAuthUid = uid;
    if (subsUid !== uid) {
      subsUid = uid;
      subscribeWorkspace(cv3);
      subscribeChat();
      subscribeReports();
      subscribeAttendance();
      registerMessaging(cv3, {
        request:
          Notification.permission === "granted" ||
          localStorage.getItem("cv3_push_enabled") === "1" ||
          (isDirectorRole() && localStorage.getItem("cv3_remind_push") === "1"),
      });
      if (canOperateRole()) scheduleProvision(cv3, { delay: 600 });
      if (isDirectorRole()) {
        setTimeout(function () {
          maybeSuggestMigration(cv3);
        }, 1200);
      }
    }
    refreshOrgSwitcherUI();
  });
  setSync("syncing", "Đang kết nối…");
  window.__CV3_openAuth = openAuthPanel;
  window.__CV3_sendChat = sendChatMessage;
  window.__CV3_dmThreadId = dmThreadId;
  window.__CV3_markMsgDelivered = markMessageDelivered;
  window.__CV3_markMsgRead = markMessageRead;
  window.__CV3_markChatThreadRead = markChatThreadRead;
  window.__CV3_ackAssignment = ackAssignment;
  window.__CV3_syncAppBadge = syncServiceWorkerBadge;
  bindPushDeliveredListener();
  refreshBootstrapUI();
}

async function main() {
  var cv3 = await waitApp();
  appCv3 = cv3;
  if (!configured) {
    console.info("Firebase chưa cấu hình — chạy offline localStorage.");
    return bootOffline(cv3);
  }
  app = initializeApp(cfg);
  auth = getAuth(app);
  db = getFirestore(app);
  await bootOnline(cv3);
}

main();
