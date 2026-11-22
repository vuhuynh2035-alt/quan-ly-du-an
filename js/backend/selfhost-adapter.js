function apiBase() {
  var raw = window.SELFHOST_API && String(window.SELFHOST_API).trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

function notConfigured(what) {
  var err = new Error(
    "SELFHOST_API chưa cấu hình (" + what + "). Đặt window.SELFHOST_API hoặc APP_BACKEND=firebase."
  );
  err.code = "backend/not-configured";
  return err;
}

function notPorted(what) {
  var err = new Error(
    "Selfhost chưa hỗ trợ «" + what + "». Dùng Firebase hoặc chờ port tiếp."
  );
  err.code = "backend/not-implemented";
  return err;
}

var _token = null;
var _user = null;
var _authListeners = [];
var _ws = null;
var _docSubs = new Map();

function loadToken() {
  try {
    _token = sessionStorage.getItem("selfhost_token") || null;
  } catch (_) {
    _token = null;
  }
}

function saveToken(token) {
  _token = token || null;
  try {
    if (_token) sessionStorage.setItem("selfhost_token", _token);
    else sessionStorage.removeItem("selfhost_token");
  } catch (_) {}
}

function notifyAuth() {
  var u = _user;
  _authListeners.slice().forEach(function (cb) {
    try {
      cb(u);
    } catch (_) {}
  });
}

function authHeaders(json) {
  var h = {};
  if (json) h["Content-Type"] = "application/json";
  if (_token) h.Authorization = "Bearer " + _token;
  return h;
}

async function api(method, path, body) {
  var base = apiBase();
  if (!base) throw notConfigured(method + " " + path);
  var opts = {
    method: method,
    credentials: "include",
    headers: authHeaders(body !== undefined),
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  var res = await fetch(base + path, opts);
  var data = null;
  var text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    var err = new Error((data && data.message) || res.statusText || "HTTP " + res.status);
    err.code = (data && data.error) || "http/" + res.status;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function toAuthUser(u) {
  if (!u) return null;
  return {
    uid: u.uid || u.id,
    email: u.email || (u.username ? u.username + "@selfhost.local" : null),
    displayName: u.displayName || u.username || "",
    forcePasswordChange: !!u.forcePasswordChange,
    getIdToken: function () {
      return Promise.resolve(_token || "");
    },
  };
}

function connectWs() {
  var base = apiBase();
  if (!base || !_token || typeof WebSocket === "undefined") return;
  try {
    if (_ws) {
      try {
        _ws.close();
      } catch (_) {}
      _ws = null;
    }
    var wsUrl = base.replace(/^http/, "ws").replace(/\/api$/, "") + "/ws?token=" + encodeURIComponent(_token);
    _ws = new WebSocket(wsUrl);
    _ws.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg && msg.type === "doc" && msg.path) {
          var set = _docSubs.get(msg.path);
          if (set) {
            set.forEach(function (cb) {
              try {
                cb({
                  id: String(msg.path).split("/").pop(),
                  exists: msg.data != null,
                  data: msg.data == null ? undefined : msg.data,
                });
              } catch (_) {}
            });
          }
        }
      } catch (_) {}
    };
  } catch (_) {}
}

async function restoreSession() {
  loadToken();
  if (!_token) {
    _user = null;
    return;
  }
  try {
    var me = await api("GET", "/auth/me");
    _user = toAuthUser(me.user);
    connectWs();
  } catch (_) {
    saveToken(null);
    _user = null;
  }
}

export var selfhostAdapter = {
  kind: "selfhost",
  isConfigured: function () {
    return !!apiBase();
  },
  init: function () {
    if (!this.isConfigured()) throw notConfigured("init");
    loadToken();
    return restoreSession();
  },
  auth: {
    get currentUser() {
      return _user;
    },
    onAuthChange: function (cb) {
      _authListeners.push(cb);
      Promise.resolve().then(function () {
        cb(_user);
      });
      return function () {
        _authListeners = _authListeners.filter(function (x) {
          return x !== cb;
        });
      };
    },
    signIn: async function (emailOrUsername, password) {
      var username = String(emailOrUsername || "");
      if (username.indexOf("@") >= 0) username = username.split("@")[0];
      var res = await api("POST", "/auth/login", {
        username: username,
        password: password,
      });
      saveToken(res.token);
      _user = toAuthUser(res.user);
      connectWs();
      notifyAuth();
      return { user: _user };
    },
    signUp: async function () {
      throw notPorted("auth.signUp");
    },
    updateProfile: async function (user, profile) {
      if (!_user) throw notPorted("auth.updateProfile");
      if (profile && profile.displayName != null) {
        await api("PUT", "/data/doc", {
          path: "users/" + (_user.uid || _user.id),
          data: { displayName: profile.displayName },
          options: { merge: true },
        });
        _user.displayName = profile.displayName;
      }
      return;
    },
    signOut: async function () {
      try {
        await api("POST", "/auth/logout", {});
      } catch (_) {}
      saveToken(null);
      _user = null;
      if (_ws) {
        try {
          _ws.close();
        } catch (_) {}
        _ws = null;
      }
      notifyAuth();
    },
    reauthenticate: async function (_userObj, password) {
      if (!_user) throw notConfigured("reauthenticate");
      var username = (_user.email || "").split("@")[0] || _user.displayName;
      await api("POST", "/auth/login", { username: username, password: password });
      return;
    },
    updatePassword: async function (_userObj, newPassword) {
      await api("POST", "/auth/change-password", {
        currentPassword: "",
        newPassword: newPassword,
      });
    },
  },
  data: {
    getDoc: async function (path) {
      return api("GET", "/data/doc?path=" + encodeURIComponent(path));
    },
    setDoc: async function (path, value, options) {
      await api("PUT", "/data/doc", { path: path, data: value, options: options });
    },
    updateDoc: async function (path, patch) {
      await api("PATCH", "/data/doc", { path: path, data: patch });
    },
    deleteDoc: async function (path) {
      await api("DELETE", "/data/doc?path=" + encodeURIComponent(path));
    },
    addDoc: async function (colPath, value) {
      return api("POST", "/data/add", { collection: colPath, data: value });
    },
    getQuery: async function (colPath, spec) {
      var res = await api("POST", "/data/query", { collection: colPath, spec: spec });
      return res.docs || [];
    },
    subscribeDoc: function (path, onNext, onError) {
      var cancelled = false;
      selfhostAdapter.data
        .getDoc(path)
        .then(function (doc) {
          if (!cancelled) onNext(doc);
        })
        .catch(function (err) {
          if (!cancelled && onError) onError(err);
        });
      if (!_docSubs.has(path)) _docSubs.set(path, new Set());
      _docSubs.get(path).add(onNext);
      return function () {
        cancelled = true;
        var set = _docSubs.get(path);
        if (set) {
          set.delete(onNext);
          if (!set.size) _docSubs.delete(path);
        }
      };
    },
    subscribeQuery: function (colPath, spec, onNext, onError) {
      var cancelled = false;
      var timer = setInterval(function () {
        selfhostAdapter.data
          .getQuery(colPath, spec)
          .then(function (docs) {
            if (!cancelled) onNext(docs);
          })
          .catch(function (err) {
            if (!cancelled && onError) onError(err);
          });
      }, 5000);
      selfhostAdapter.data
        .getQuery(colPath, spec)
        .then(function (docs) {
          if (!cancelled) onNext(docs);
        })
        .catch(function (err) {
          if (!cancelled && onError) onError(err);
        });
      return function () {
        cancelled = true;
        clearInterval(timer);
      };
    },
    batchSet: async function (ops, options) {
      await api("POST", "/data/batchSet", { ops: ops, options: options });
    },
  },
  callable: async function (name) {
    return async function (payload) {
      var res = await api("POST", "/callable/" + encodeURIComponent(name), payload || {});
      return res;
    };
  },
  call: async function (name, payload) {
    var res = await api("POST", "/callable/" + encodeURIComponent(name), payload || {});
    return res && Object.prototype.hasOwnProperty.call(res, "data") ? res.data : res;
  },
  storage: {
    prepare: async function () {
      return;
    },
    upload: async function (storagePath, file, metadata) {
      var base = apiBase();
      if (!base) throw notConfigured("storage.upload");
      var fd = new FormData();
      fd.append("file", file);
      fd.append("path", storagePath || "");
      if (metadata && metadata.contentType) fd.append("contentType", metadata.contentType);
      var res = await fetch(base + "/storage/upload", {
        method: "POST",
        credentials: "include",
        headers: _token ? { Authorization: "Bearer " + _token } : {},
        body: fd,
      });
      var data = await res.json();
      if (!res.ok) {
        var err = new Error(data.message || "Upload failed");
        err.code = data.error || "storage/error";
        throw err;
      }
      var origin = base.replace(/\/api$/, "");
      return data.url && data.url.indexOf("http") === 0 ? data.url : origin + data.url;
    },
  },
  push: {
    swUrl: "push-sw.js",
    isSupported: function () {
      return Promise.resolve(
        typeof window !== "undefined" &&
          "serviceWorker" in navigator &&
          "PushManager" in window
      );
    },
    getClient: async function () {
      return { kind: "web-push" };
    },
    getToken: async function (_client, options) {
      if (!("serviceWorker" in navigator)) throw notPorted("push.getToken");
      var reg =
        (options && options.serviceWorkerRegistration) ||
        (await navigator.serviceWorker.ready);
      var sub = await reg.pushManager.getSubscription();
      if (!sub) {
        var key = options && options.vapidKey;
        if (!key) throw notPorted("push.getToken(vapidKey)");
        function urlBase64ToUint8Array(base64String) {
          var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
          var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
          var raw = atob(base64);
          var out = new Uint8Array(raw.length);
          for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
          return out;
        }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
      }
      await api("POST", "/push/subscribe", { subscription: sub.toJSON() });
      return JSON.stringify(sub.toJSON());
    },
    onForegroundMessage: function () {
      return function () {};
    },
  },
  time: {
    serverTime: function () {
      return new Date().toISOString();
    },
    toMillis: function (v) {
      if (v == null) return 0;
      if (typeof v === "number") return v;
      var t = Date.parse(String(v));
      return isNaN(t) ? 0 : t;
    },
    toDate: function (v) {
      var ms = this.toMillis(v);
      return ms ? new Date(ms) : null;
    },
  },
};
