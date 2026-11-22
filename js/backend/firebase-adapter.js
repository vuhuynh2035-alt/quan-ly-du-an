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

/** Lazy SDK chunks — messaging / storage / functions không chặn first paint. */
var _fnModP = null;
var _stModP = null;
var _msgModP = null;
var _msgMod = null;
function loadFunctionsMod() {
  if (!_fnModP) _fnModP = import("firebase/functions");
  return _fnModP;
}
function loadStorageMod() {
  if (!_stModP) _stModP = import("firebase/storage");
  return _stModP;
}
function loadMessagingMod() {
  if (!_msgModP) {
    _msgModP = import("firebase/messaging").then(function (m) {
      _msgMod = m;
      return m;
    });
  }
  return _msgModP;
}

var fbApp = null;
var fbAuth = null;
var fbDb = null;

function isConfigured() {
  var cfg = window.FIREBASE_CONFIG;
  return !!(
    cfg &&
    cfg.apiKey &&
    cfg.apiKey !== "YOUR_API_KEY" &&
    cfg.projectId &&
    cfg.projectId !== "YOUR_PROJECT_ID"
  );
}

function init() {
  if (fbApp) return;
  fbApp = initializeApp(window.FIREBASE_CONFIG);
  fbAuth = getAuth(fbApp);
  fbDb = getFirestore(fbApp);
}

/* ---------- auth ---------- */

var auth = {
  get currentUser() {
    return fbAuth ? fbAuth.currentUser : null;
  },
  onAuthChange: function (cb) {
    return onAuthStateChanged(fbAuth, cb);
  },
  signIn: function (email, password) {
    return signInWithEmailAndPassword(fbAuth, email, password);
  },
  signUp: function (email, password) {
    return createUserWithEmailAndPassword(fbAuth, email, password);
  },
  updateProfile: function (user, profile) {
    return updateProfile(user, profile);
  },
  signOut: function () {
    return signOut(fbAuth);
  },
  reauthenticate: function (user, password) {
    var cred = EmailAuthProvider.credential(user.email, password);
    return reauthenticateWithCredential(user, cred);
  },
  updatePassword: function (user, newPassword) {
    return updatePassword(user, newPassword);
  },
};

/* ---------- data (Firestore) ---------- */

function buildQuery(path, spec) {
  var col = collection(fbDb, path);
  if (!spec) return col;
  var parts = [];
  (spec.where || []).forEach(function (w) {
    parts.push(where(w[0], w[1], w[2]));
  });
  (spec.orderBy || []).forEach(function (o) {
    parts.push(orderBy(o[0], o[1] || "asc"));
  });
  if (spec.limit) parts.push(limit(spec.limit));
  return parts.length ? query.apply(null, [col].concat(parts)) : col;
}

function docOf(snap) {
  var exists = snap.exists();
  return { id: snap.id, exists: exists, data: exists ? snap.data() : undefined };
}

function docsOf(snap) {
  return snap.docs.map(function (d) {
    return { id: d.id, data: d.data() };
  });
}

var data = {
  getDoc: async function (path) {
    return docOf(await getDoc(doc(fbDb, path)));
  },
  setDoc: function (path, value, options) {
    var ref = doc(fbDb, path);
    return options ? setDoc(ref, value, options) : setDoc(ref, value);
  },
  updateDoc: function (path, patch) {
    return updateDoc(doc(fbDb, path), patch);
  },
  deleteDoc: function (path) {
    return deleteDoc(doc(fbDb, path));
  },
  addDoc: async function (colPath, value) {
    var ref = await addDoc(collection(fbDb, colPath), value);
    return { id: ref.id };
  },
  getQuery: async function (colPath, spec) {
    return docsOf(await getDocs(buildQuery(colPath, spec)));
  },
  subscribeDoc: function (path, onNext, onError) {
    return onSnapshot(
      doc(fbDb, path),
      function (snap) {
        onNext(docOf(snap));
      },
      onError
    );
  },
  subscribeQuery: function (colPath, spec, onNext, onError) {
    return onSnapshot(
      buildQuery(colPath, spec),
      function (snap) {
        onNext(docsOf(snap));
      },
      onError
    );
  },
  /** Một lần commit — caller tự chia lô (Firestore giới hạn 500 thao tác/batch). */
  batchSet: async function (ops, options) {
    var batch = writeBatch(fbDb);
    for (var i = 0; i < ops.length; i++) {
      if (options) batch.set(doc(fbDb, ops[i].path), ops[i].data, options);
      else batch.set(doc(fbDb, ops[i].path), ops[i].data);
    }
    await batch.commit();
  },
};

/* ---------- server functions (Cloud Functions callables) ---------- */

async function callable(name, region) {
  var mod = await loadFunctionsMod();
  var fns = region ? mod.getFunctions(fbApp, region) : mod.getFunctions(fbApp);
  return mod.httpsCallable(fns, name);
}

async function call(name, payload, options) {
  var fn = await callable(name, options && options.region);
  var res = await fn(payload);
  return res.data;
}

/* ---------- storage ---------- */

var storage = {
  prepare: async function () {
    var st = await loadStorageMod();
    st.getStorage(fbApp);
  },
  upload: async function (path, file, metadata) {
    var st = await loadStorageMod();
    var storageRef = st.ref(st.getStorage(fbApp), path);
    await st.uploadBytes(storageRef, file, metadata);
    return await st.getDownloadURL(storageRef);
  },
};

/* ---------- push (FCM) ---------- */

var push = {
  swUrl: "firebase-messaging-sw.js?v=4",
  isSupported: async function () {
    var mod = await loadMessagingMod();
    return mod.isSupported();
  },
  getClient: async function () {
    var mod = await loadMessagingMod();
    return mod.getMessaging(fbApp);
  },
  getToken: async function (client, options) {
    var mod = await loadMessagingMod();
    return mod.getToken(client, options);
  },
  onForegroundMessage: function (client, cb) {
    if (_msgMod) return _msgMod.onMessage(client, cb);
    loadMessagingMod().then(function (mod) {
      mod.onMessage(client, cb);
    });
    return function () {};
  },
};

/* ---------- timestamps ---------- */

function toMillis(v) {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") {
    return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  }
  if (typeof v === "string") {
    var t = Date.parse(v);
    return isNaN(t) ? 0 : t;
  }
  return 0;
}

var time = {
  serverTime: function () {
    return serverTimestamp();
  },
  toMillis: toMillis,
  toDate: function (v) {
    var ms = toMillis(v);
    return ms ? new Date(ms) : null;
  },
};

export var firebaseAdapter = {
  kind: "firebase",
  isConfigured: isConfigured,
  init: init,
  auth: auth,
  data: data,
  callable: callable,
  call: call,
  storage: storage,
  push: push,
  time: time,
};
