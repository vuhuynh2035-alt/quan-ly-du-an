/* eslint-disable no-undef */
/* cv3-fcm-sw v4 — bump this comment when changing SW so browsers refetch */
var CV3_SW_VERSION = 4;
var CV3_BASE = new URL("./", self.location.href).pathname;
var CV3_ICON = CV3_BASE + "icon-192.png";
var CV3_BADGE_CACHE = "cv3-badge-v1";
var CV3_BADGE_URL = CV3_BASE + "__cv3_badge_count";

// Register click handler BEFORE importing FCM so the SDK does not overwrite it.
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var data = (event.notification && event.notification.data) || {};
  var tag = (event.notification && event.notification.tag) || "";
  var url = CV3_BASE;
  if (data.type === "reminder" || tag.indexOf("rem_") === 0) url = CV3_BASE + "?tab=lich";
  else if (
    data.type === "arrival" ||
    data.type === "assignment" ||
    data.type === "schedule" ||
    tag.indexOf("arr_") === 0 ||
    tag.indexOf("asgn_") === 0 ||
    tag.indexOf("sched_") === 0
  )
    url = CV3_BASE + "?tab=mywork";
  else if (data.type === "chat" || tag.indexOf("chat_") === 0) {
    url = CV3_BASE + "?tab=chat";
    if (data.chatType !== "broadcast" && data.fromUid) {
      url += "&dm=" + encodeURIComponent(String(data.fromUid));
    }
  }
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if ("focus" in c) {
          if ("navigate" in c && url !== CV3_BASE) {
            try {
              return c.navigate(url).then(function () {
                return c.focus();
              });
            } catch (e) {
              /* fall through to postMessage */
            }
          }
          try {
            c.postMessage({
              type: "cv3-open-chat",
              dm: data.chatType === "broadcast" ? "" : String(data.fromUid || ""),
              tab: "chat",
              chatType: String(data.chatType || ""),
            });
          } catch (e2) {}
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

importScripts(
  "https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js"
);
importScripts(CV3_BASE + "firebase-config.js");

firebase.initializeApp(FIREBASE_CONFIG);
var messaging = firebase.messaging();

function readBadgeCount() {
  return caches.open(CV3_BADGE_CACHE).then(function (cache) {
    return cache.match(CV3_BADGE_URL).then(function (res) {
      if (!res) return 0;
      return res.text().then(function (t) {
        var n = parseInt(t, 10);
        return isNaN(n) || n < 0 ? 0 : n;
      });
    });
  });
}

function writeBadgeCount(n) {
  var next = Math.max(0, Math.min(9999, n | 0));
  return caches.open(CV3_BADGE_CACHE).then(function (cache) {
    return cache.put(CV3_BADGE_URL, new Response(String(next), { status: 200 }));
  }).then(function () {
    if (self.navigator && self.navigator.setAppBadge) {
      if (next > 0) return self.navigator.setAppBadge(next).catch(function () {});
      if (self.navigator.clearAppBadge) return self.navigator.clearAppBadge().catch(function () {});
    }
    return undefined;
  }).then(function () {
    return next;
  });
}

function bumpAppBadge(delta) {
  var d = delta == null ? 1 : delta | 0;
  if (!d) return Promise.resolve(0);
  return readBadgeCount().then(function (n) {
    return writeBadgeCount(n + d);
  });
}

function setAppBadgeExact(n) {
  return writeBadgeCount(n);
}

self.addEventListener("message", function (event) {
  var msg = event && event.data;
  if (!msg || !msg.type) return;
  if (msg.type === "cv3-set-badge") {
    event.waitUntil(setAppBadgeExact(msg.count == null ? 0 : msg.count));
  } else if (msg.type === "cv3-clear-badge") {
    event.waitUntil(setAppBadgeExact(0));
  } else if (msg.type === "cv3-sw-ping") {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ type: "cv3-sw-pong", version: CV3_SW_VERSION });
    }
  }
});

function showPushNotification(payload) {
  var data = (payload && payload.data) || {};
  var n = (payload && payload.notification) || {};
  var isRem = data.type === "reminder";
  var isArr = data.type === "arrival";
  var isChat = data.type === "chat";
  var isSched = data.type === "schedule";
  var title =
    data.title ||
    n.title ||
    (isArr
      ? "📍 Xác nhận đến vị trí"
      : isRem
        ? "🔔 Nhắc hẹn"
        : isChat
          ? "💬 Tin nhắn mới"
          : isSched
            ? "📅 Lịch công việc đã điều chỉnh"
            : "📋 Công việc mới");
  var body = data.body || n.body || "";
  var tag = isChat
    ? "chat_" + (data.msgId || "new")
    : isArr
      ? "arr_" + (data.reminderId || data.asgnId || "arrival")
      : isRem
        ? "rem_" + (data.reminderId || "reminder")
        : isSched
          ? "sched_" + (data.asgnId || "adj")
          : "asgn_" + (data.asgnId || "new");
  var vibrate = isRem || isArr
    ? [0, 450, 160, 450, 160, 700, 200, 700]
    : [0, 450, 160, 450, 160, 700];

  // Attach routing data onto the displayed notification (needed when we show it ourselves).
  var notifData = Object.assign({}, data);
  if (!notifData.type && n.title) {
    // Best-effort: keep empty type so click opens home.
  }

  return self.registration
    .showNotification(title, {
      body: body,
      icon: CV3_ICON,
      badge: CV3_ICON,
      data: notifData,
      tag: tag,
      vibrate: vibrate,
      silent: false,
      renotify: true,
      requireInteraction: true,
    })
    .then(function () {
      if ((data.type === "chat" && data.msgId) || (data.type === "assignment" && data.asgnId)) {
        return clients
          .matchAll({ type: "window", includeUncontrolled: true })
          .then(function (list) {
            list.forEach(function (c) {
              c.postMessage({ type: "cv3-push-delivered", data: data });
            });
          });
      }
    });
}

messaging.onBackgroundMessage(function (payload) {
  var data = (payload && payload.data) || {};
  var hasDisplay =
    (payload && payload.notification && (payload.notification.title || payload.notification.body)) ||
    false;
  var jobs = [];

  if (data.badgeBump === "1" || data.type === "chat" || data.type === "assignment" ||
      data.type === "schedule" || data.type === "reminder" || data.type === "arrival") {
    jobs.push(bumpAppBadge(1));
  }

  // Keep compatibility with older notification payloads while new messages are data-only.
  if (!hasDisplay) {
    jobs.push(showPushNotification(payload));
  } else if ((data.type === "chat" && data.msgId) || (data.type === "assignment" && data.asgnId)) {
    // Ack delivery even when OS showed the tray notification.
    jobs.push(
      clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
        list.forEach(function (c) {
          c.postMessage({ type: "cv3-push-delivered", data: data });
        });
      })
    );
  }

  return Promise.all(jobs);
});
