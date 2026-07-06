import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
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
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

var cfg = window.FIREBASE_CONFIG;
var vapidKey = window.FIREBASE_VAPID_KEY;
var defaultOrg = window.FIREBASE_DEFAULT_ORG || "saree";
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
var unsubChatBc = null;
var unsubChatDm = null;
var chatMsgsBc = [];
var chatMsgsDm = [];
var unsubReports = null;
var pushReady = false;
var writeTimer = null;
var writing = false;
var remotePatch = 0;
var booted = false;
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
  var snap = await getDoc(doc(db, "workspaces", org, "data", "main"));
  var emps = snap.exists() ? snap.data().emp || [] : [];
  if (!emps.length && appCv3 && appCv3.S && appCv3.S.emp && appCv3.S.emp.length) {
    emps = appCv3.S.emp;
  }
  function empKey(e) {
    return e.loginKey || sanitizeUsername(e.name);
  }
  var emp = emps.find(function (e) {
    return empKey(e) === u;
  });
  if (emp) {
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
    a.age === b.age
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
  unsubChatAll();
  if (unsubReports) unsubReports();
  unsubReports = null;
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
      if (!isDirectorRole()) {
        throw new Error("Chỉ giám đốc mới được gửi thông báo toàn đội.");
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

function reportsColRef() {
  return collection(doc(db, "workspaces", orgId), "reports");
}

function subscribeReports() {
  if (unsubReports) unsubReports();
  if (!db) return;
  var q = query(reportsColRef(), orderBy("at", "desc"), limit(300));
  unsubReports = onSnapshot(
    q,
    function (snap) {
      var reports = snap.docs.map(function (d) {
        return Object.assign({ id: d.id }, d.data());
      });
      if (appCv3 && appCv3.setReports) appCv3.setReports(reports);
    },
    function (err) {
      console.error("reports:", err);
    }
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function uploadReportPhotos(files, asgnId, date) {
  if (!files || !files.length) return [];
  if (!app || !auth || !auth.currentUser) {
    throw new Error("Cần đăng nhập.");
  }
  var storage = getStorage(app);
  var urls = [];
  var max = Math.min(files.length, 8);
  for (var i = 0; i < max; i++) {
    var file = files[i];
    if (!file || !file.type || file.type.indexOf("image/") !== 0) continue;
    if (file.size > 8 * 1024 * 1024) {
      throw new Error("Ảnh «" + (file.name || "ảnh") + "» quá 8MB.");
    }
    var ext = (file.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
    var path =
      "workspaces/" +
      orgId +
      "/reports/" +
      auth.currentUser.uid +
      "/" +
      asgnId +
      "/" +
      date +
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

async function submitDailyReport(payload) {
  if (!app || !auth || !auth.currentUser) {
    throw new Error("Cần đăng nhập cloud.");
  }
  var date = payload.date || todayIso();
  var photoUrls = await uploadReportPhotos(payload.photos || [], payload.asgnId, date);
  var fn = httpsCallable(getFunctions(app), "submitDailyReport");
  var res = await fn({
    orgId: orgId,
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
    if (err && err.code === "functions/invalid-argument" && err.details) {
      msg = String(err.details);
    }
    throw new Error(msg);
  }
}

function isDirectorRole() {
  return window.__CV3_AUTH && window.__CV3_AUTH.role === "director";
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
  if (!app || !auth || !auth.currentUser || !isDirectorRole()) {
    if (force) throw new Error("Chỉ giám đốc đã đăng nhập mới tạo được tài khoản.");
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
  var fn = httpsCallable(getFunctions(app), "changeMyPassword");
  try {
    var res = await fn(payload || {});
    return res.data || {};
  } catch (err) {
    var msg =
      (err && err.message) ||
      (err && err.details) ||
      "Không đổi được mật khẩu.";
    throw new Error(msg);
  }
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
  var bar = $("sync-bar");
  var dot = $("sync-dot");
  var lbl = $("sync-label");
  if (!bar) return;
  bar.style.display = "flex";
  if (dot) dot.className = "sync-dot sync-" + status;
  if (lbl) lbl.textContent = text;
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
  var o =
    String(org || defaultOrg || "saree")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") || "saree";
  return o + "." + u + "@qlcv.local";
}

function emailToUsername(email) {
  if (!email) return "";
  var m = String(email).match(/^[^.]+\.([^@]+)@/);
  if (m) return m[1];
  return String(email).split("@")[0] || "";
}

function resolveAuthIdentity(input, org) {
  var raw = String(input || "").trim();
  if (raw.indexOf("@") >= 0) {
    return { email: raw, username: raw.split("@")[0] };
  }
  var username = sanitizeUsername(raw);
  return { email: userToEmail(username, org), username: username };
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
}

function updateAuthHints(mode) {
  var userHint = $("auth-user-hint");
  var passHint = $("auth-pass-hint");
  var loginBtn = $("auth-login-mode");
  var desc = $("auth-desc");
  if (mode === "signup") {
    if (desc)
      desc.innerHTML =
        "Lần đầu dùng app — chọn tên đăng nhập và mật khẩu cho tài khoản <b>giám đốc</b>.";
    if (userHint)
      userHint.textContent = "Tên đăng nhập tùy chọn (không dấu, ≥2 ký tự) — quyền giám đốc gắn với chức vụ, không phụ thuộc tên.";
    if (passHint) {
      passHint.textContent = "Đặt mật khẩu mới (≥6 ký tự).";
      passHint.style.display = "block";
    }
    if (loginBtn) loginBtn.style.display = "inline-flex";
  } else {
    if (desc)
      desc.innerHTML =
        "Nhân viên đăng nhập bằng <b>tên đăng nhập</b> (không dấu). Mật khẩu ban đầu trùng tên đăng nhập — đổi trong Cài đặt sau khi đăng nhập.";
    if (userHint)
      userHint.textContent =
        "Nhập tên đăng nhập (không dấu) — tài khoản được tạo tự động từ danh sách nhân sự.";
    if (passHint) {
      passHint.textContent = "";
      passHint.style.display = "none";
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

function workspaceRef() {
  return doc(db, "workspaces", orgId, "data", "main");
}

function payloadFromApp(cv3) {
  return {
    emp: cv3.S.emp,
    cust: cv3.S.cust,
    proj: cv3.S.proj,
    asgn: cv3.S.asgn,
    projLog: cv3.S.projLog || [],
    reminders: cv3.S.reminders || [],
    cfg: cv3.S.cfg,
    patch: cv3.getPatch(),
    updatedAt: serverTimestamp(),
    updatedBy: auth && auth.currentUser ? userLabel(auth.currentUser) : "",
  };
}

function applyRemote(cv3, data) {
  var patch = data.patch || 0;
  if (patch <= cv3.getPatch()) {
    if (data.emp && cv3.mergeEmpAuthFromRemote) cv3.mergeEmpAuthFromRemote(data.emp);
    return false;
  }
  cv3.applyRemote({
    emp: data.emp,
    cust: data.cust,
    proj: data.proj,
    asgn: data.asgn,
    projLog: data.projLog,
    reminders: data.reminders,
    cfg: data.cfg,
    patch: patch,
  });
  remotePatch = patch;
  return true;
}

async function ensureUserDoc(user, org, username, preset) {
  var ref = doc(db, "users", user.uid);
  var snap = await getDoc(ref);
  var un = username || user.displayName || emailToUsername(user.email);
  var role, empId, displayName, age;
  if (!snap.exists()) {
    var acct = preset || (await resolveAccount(un, org));
    role = acct.role;
    empId = acct.empId;
    displayName = user.displayName || "";
    age = null;
    await setDoc(ref, {
      username: un,
      orgId: org,
      role: role,
      empId: empId || "",
      displayName: displayName,
      age: age,
      createdAt: serverTimestamp(),
    });
    orgId = org;
  } else {
    var d = snap.data();
    role = d.role || "employee";
    empId = d.empId || null;
    displayName = d.displayName || user.displayName || "";
    age = d.age != null ? d.age : null;
    if (d.orgId) orgId = d.orgId;
    if (!d.username && un) {
      await setDoc(ref, { username: un }, { merge: true });
    }
  }
  publishAuth({
    role: role,
    empId: empId,
    username: un,
    uid: user.uid,
    displayName: displayName,
    age: age,
  });
  if (empId && appCv3 && appCv3.linkEmpAuth) {
    appCv3.linkEmpAuth(empId, user.uid);
  }
  return { role: role, empId: empId, username: un, displayName: displayName, age: age };
}

function scheduleWrite(cv3) {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(function () {
    flushWrite(cv3);
  }, 450);
}

async function flushWrite(cv3) {
  if (!auth || !auth.currentUser || writing) return;
  if (!isDirectorRole()) return;
  var localPatch = cv3.getPatch();
  if (localPatch <= remotePatch) return;
  writing = true;
  setSync("syncing", "Đang lưu lên cloud…");
  try {
    await setDoc(workspaceRef(), payloadFromApp(cv3), { merge: false });
    remotePatch = localPatch;
    setSync("online", "Đồng bộ · " + orgId);
    if (countEmpNeedingAuth(cv3)) scheduleProvision(cv3);
  } catch (err) {
    console.error(err);
    setSync("error", "Lỗi lưu cloud");
  }
  writing = false;
}

function subscribeWorkspace(cv3) {
  if (unsubSnap) unsubSnap();
  setSync("syncing", "Đang tải dữ liệu…");
  unsubSnap = onSnapshot(
    workspaceRef(),
    function (snap) {
      if (!snap.exists()) {
        if (!booted) {
          booted = true;
          cv3.seedDemo();
          cv3.render();
          flushWrite(cv3).then(function () {
            if (isDirectorRole()) scheduleProvision(cv3);
          });
        }
        setSync("online", "Cloud mới · " + orgId);
        return;
      }
      var data = snap.data();
      var changed = applyRemote(cv3, data);
      if (!booted) {
        booted = true;
        if (!changed) cv3.seedDemo();
        cv3.render();
      } else if (changed) {
        cv3.render();
      }
      remotePatch = data.patch || remotePatch;
      var who = auth && auth.currentUser ? userLabel(auth.currentUser) : "";
      setSync("online", (who ? who + " · " : "") + "đồng bộ · " + orgId);
      if (isDirectorRole()) scheduleProvision(cv3);
    },
    function (err) {
      console.error(err);
      setSync("error", "Mất kết nối cloud");
    }
  );
}

async function registerMessaging(cv3) {
  if (!configured || !vapidKey || vapidKey === "YOUR_VAPID_KEY") return;
  var ok = await isSupported();
  if (!ok) return;
  try {
    var reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });
    var messaging = getMessaging(app, { serviceWorkerRegistration: reg });
    var perm = await Notification.requestPermission();
    if (perm !== "granted") return;
    var token = await getToken(messaging, { vapidKey: vapidKey });
    if (!token) return;
    pushReady = true;
    window.__CV3_FCM = { token: token, messaging: messaging };
    var linked = localStorage.getItem("cv3_fcm_emp");
    var empId =
      (window.__CV3_AUTH && window.__CV3_AUTH.empId) || linked;
    if (isDirectorRole() && empId && appCv3) {
      appCv3.linkFcmToEmp(empId, token);
    } else if (empId) {
      await saveMyFcmToken(token, empId);
    } else if (linked) {
      await saveMyFcmToken(token, linked);
    }
  } catch (err) {
    console.warn("FCM:", err);
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
  if (c === "functions/failed-precondition") return (err && err.message) || "Không thể thiết lập giám đốc.";
  return (err && err.message) || String(err);
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
      var id = resolveAuthIdentity(userInput, org);
      if (mode === "signup") {
        var hasDir = await hasDirectorInOrg(org);
        if (hasDir) {
          throw Object.assign(
            new Error(
              "Đội đã có giám đốc — nhân viên không tự đăng ký. Liên hệ giám đốc để được cấp tài khoản."
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
        await ensureUserDoc(cred.user, org, id.username);
      } else {
        var lc = await signInWithEmailAndPassword(auth, id.email, pass);
        await ensureUserDoc(lc.user, org, id.username);
      }
      showAuth(false);
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

  var btnOut = $("auth-signout");
  var btnIn = $("auth-signin");
  if (btnIn) btnIn.addEventListener("click", openAuthPanel);
  if (btnOut) btnOut.addEventListener("click", doSignOut);
  window.__CV3_signOut = doSignOut;
}

async function bootOffline(cv3) {
  setSync("offline", "Chỉ lưu trên máy này");
  cv3.finishBoot();
}

async function bootOnline(cv3) {
  bindAuthUI(cv3);
  cv3.setSvHook(function () {
    scheduleWrite(cv3);
  });
  window.__CV3_enablePush = function (empId) {
    localStorage.setItem("cv3_fcm_emp", empId);
    if (window.__CV3_FCM && window.__CV3_FCM.token)
      cv3.linkFcmToEmp(empId, window.__CV3_FCM.token);
  };
  window.__CV3_provisionEmp = provisionEmployeeAccount;
  window.__CV3_provisionAllEmployees = function (force) {
    return provisionAllEmployees(cv3, { force: !!force });
  };
  window.__CV3_changePassword = changeMyPassword;
  window.__CV3_updateProfile = updateMyProfile;
  window.__CV3_updateUsername = updateMyUsername;
  window.__CV3_submitReport = callSubmitReport;
  onAuthStateChanged(auth, async function (user) {
    var epoch = ++authEpoch;
    var uid = user ? user.uid : null;
    updateAuthButtons(user);
    if (!user) {
      stopSubscriptions();
      publishAuth(null);
      if (authOverlayVisible !== true) switchToLoginMode();
      showAuth(true);
      refreshBootstrapUI();
      setSync("offline", "Chưa đăng nhập cloud — bấm Đăng nhập");
      return;
    }
    if (uid === lastAuthUid && booted) {
      showAuth(false);
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
      await ensureUserDoc(user, orgId, who);
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
      registerMessaging(cv3);
      if (isDirectorRole()) scheduleProvision(cv3, { delay: 600 });
    }
  });
  setSync("syncing", "Đang kết nối…");
  window.__CV3_openAuth = openAuthPanel;
  window.__CV3_sendChat = sendChatMessage;
  window.__CV3_dmThreadId = dmThreadId;
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
