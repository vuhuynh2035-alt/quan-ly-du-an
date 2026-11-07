function notImplemented(what) {
  var err = new Error(
    "Backend «selfhost» chưa được triển khai (" + what + "). Đặt window.APP_BACKEND = \"firebase\" hoặc chờ bản server tự host."
  );
  err.code = "backend/not-implemented";
  return err;
}

function stub(what) {
  return function () {
    throw notImplemented(what);
  };
}

function asyncStub(what) {
  return function () {
    return Promise.reject(notImplemented(what));
  };
}

export var selfhostAdapter = {
  kind: "selfhost",
  isConfigured: function () {
    return true;
  },
  init: stub("init"),
  auth: {
    get currentUser() {
      return null;
    },
    onAuthChange: stub("auth.onAuthChange"),
    signIn: asyncStub("auth.signIn"),
    signUp: asyncStub("auth.signUp"),
    updateProfile: asyncStub("auth.updateProfile"),
    signOut: asyncStub("auth.signOut"),
    reauthenticate: asyncStub("auth.reauthenticate"),
    updatePassword: asyncStub("auth.updatePassword"),
  },
  data: {
    getDoc: asyncStub("data.getDoc"),
    setDoc: asyncStub("data.setDoc"),
    updateDoc: asyncStub("data.updateDoc"),
    deleteDoc: asyncStub("data.deleteDoc"),
    addDoc: asyncStub("data.addDoc"),
    getQuery: asyncStub("data.getQuery"),
    subscribeDoc: stub("data.subscribeDoc"),
    subscribeQuery: stub("data.subscribeQuery"),
    batchSet: asyncStub("data.batchSet"),
  },
  callable: asyncStub("callable"),
  call: asyncStub("call"),
  storage: {
    prepare: asyncStub("storage.prepare"),
    upload: asyncStub("storage.upload"),
  },
  push: {
    swUrl: "push-sw.js",
    isSupported: function () {
      return Promise.resolve(false);
    },
    getClient: asyncStub("push.getClient"),
    getToken: asyncStub("push.getToken"),
    onForegroundMessage: stub("push.onForegroundMessage"),
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
