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
} from "firebase/firestore";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

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
var pushReady = false;
var writeTimer = null;
var writing = false;
var remotePatch = 0;
var booted = false;

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

function showAuth(show) {
  var el = $("auth-overlay");
  if (el) el.style.display = show ? "flex" : "none";
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
    cfg: cv3.S.cfg,
    patch: cv3.getPatch(),
    updatedAt: serverTimestamp(),
    updatedBy: auth && auth.currentUser ? auth.currentUser.email : "",
  };
}

function applyRemote(cv3, data) {
  var patch = data.patch || 0;
  if (patch <= cv3.getPatch()) return false;
  cv3.applyRemote({
    emp: data.emp,
    cust: data.cust,
    proj: data.proj,
    asgn: data.asgn,
    cfg: data.cfg,
    patch: patch,
  });
  remotePatch = patch;
  return true;
}

async function ensureUserDoc(user, org) {
  var ref = doc(db, "users", user.uid);
  var snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email || "",
      orgId: org,
      displayName: user.displayName || "",
      createdAt: serverTimestamp(),
    });
  } else {
    var d = snap.data();
    if (d.orgId) orgId = d.orgId;
  }
}

function scheduleWrite(cv3) {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(function () {
    flushWrite(cv3);
  }, 450);
}

async function flushWrite(cv3) {
  if (!auth || !auth.currentUser || writing) return;
  var localPatch = cv3.getPatch();
  if (localPatch <= remotePatch) return;
  writing = true;
  setSync("syncing", "Đang lưu lên cloud…");
  try {
    await setDoc(workspaceRef(), payloadFromApp(cv3), { merge: false });
    remotePatch = localPatch;
    setSync("online", "Đồng bộ · " + orgId);
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
          flushWrite(cv3);
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
      setSync("online", "Đồng bộ realtime · " + orgId);
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
    if (linked) cv3.linkFcmToEmp(linked, token);
  } catch (err) {
    console.warn("FCM:", err);
  }
}

function bindAuthUI(cv3) {
  var form = $("auth-form");
  if (!form) return;
  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var email = ($("auth-email") || {}).value.trim();
    var pass = ($("auth-pass") || {}).value;
    var org = (($("auth-org") || {}).value || defaultOrg).trim() || defaultOrg;
    var errEl = $("auth-err");
    var mode = form.dataset.mode || "login";
    if (errEl) errEl.textContent = "";
    try {
      if (mode === "signup") {
        var cred = await createUserWithEmailAndPassword(auth, email, pass);
        orgId = org;
        await updateProfile(cred.user, { displayName: org });
        await ensureUserDoc(cred.user, org);
      } else {
        var lc = await signInWithEmailAndPassword(auth, email, pass);
        await ensureUserDoc(lc.user, org);
      }
      showAuth(false);
    } catch (err) {
      if (errEl) errEl.textContent = err.message || String(err);
    }
  });

  var btnSignup = $("auth-signup");
  var btnLogin = $("auth-login-mode");
  if (btnSignup)
    btnSignup.addEventListener("click", function () {
      form.dataset.mode = "signup";
      $("auth-title").textContent = "Đăng ký tài khoản đội";
      $("auth-submit").textContent = "Đăng ký";
      btnSignup.style.display = "none";
      if (btnLogin) btnLogin.style.display = "inline-flex";
    });
  if (btnLogin)
    btnLogin.addEventListener("click", function () {
      form.dataset.mode = "login";
      $("auth-title").textContent = "Đăng nhập cloud";
      $("auth-submit").textContent = "Đăng nhập";
      btnLogin.style.display = "none";
      btnSignup.style.display = "inline-flex";
    });

  var btnOut = $("auth-signout");
  if (btnOut)
    btnOut.addEventListener("click", async function () {
      if (unsubSnap) unsubSnap();
      await signOut(auth);
      booted = false;
      showAuth(true);
      setSync("offline", "Đã đăng xuất");
    });
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
  onAuthStateChanged(auth, async function (user) {
    var btnOut = $("auth-signout");
    if (!user) {
      if (btnOut) btnOut.style.display = "none";
      showAuth(true);
      setSync("offline", "Chưa đăng nhập cloud");
      return;
    }
    if (btnOut) btnOut.style.display = "inline-flex";
    showAuth(false);
    await ensureUserDoc(user, orgId);
    subscribeWorkspace(cv3);
    registerMessaging(cv3);
  });
}

async function main() {
  var cv3 = await waitApp();
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
