/* eslint-disable no-undef */
importScripts(
  "https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js"
);
importScripts("/firebase-config.js");

firebase.initializeApp(FIREBASE_CONFIG);
var messaging = firebase.messaging();

function functionsBaseUrl() {
  var projectId = (FIREBASE_CONFIG && FIREBASE_CONFIG.projectId) || "";
  var region =
    (typeof FIREBASE_FUNCTIONS_REGION !== "undefined" && FIREBASE_FUNCTIONS_REGION) ||
    "us-central1";
  if (!projectId) return "";
  return "https://" + region + "-" + projectId + ".cloudfunctions.net";
}

function deepLinkFromData(data) {
  data = data || {};
  if (data.type === "reminder") return "/?tab=lich";
  if (data.type === "arrival") {
    return data.asgnId
      ? "/?tab=mywork&asgn=" + encodeURIComponent(data.asgnId)
      : "/?tab=mywork";
  }
  if (data.type === "assignment") {
    return data.asgnId
      ? "/?tab=mywork&asgn=" + encodeURIComponent(data.asgnId)
      : "/?tab=mywork";
  }
  if (data.type === "chat") {
    if (data.threadId) return "/?tab=chat&thread=" + encodeURIComponent(data.threadId);
    return "/?tab=chat";
  }
  return "/";
}

function ackDelivered(data) {
  data = data || {};
  if (!data.deliveryId || !data.ackToken || !data.orgId) return Promise.resolve();
  var base = functionsBaseUrl();
  if (!base) return Promise.resolve();
  return fetch(base + "/ackPush", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        deliveryId: data.deliveryId,
        ackToken: data.ackToken,
        orgId: data.orgId,
        status: "delivered",
      },
    }),
  }).catch(function () {});
}

function showPushNotification(payload) {
  var data = (payload && payload.data) || {};
  var n = (payload && payload.notification) || {};
  var isRem = data.type === "reminder";
  var isArr = data.type === "arrival";
  var isChat = data.type === "chat";
  var isTest = data.type === "test";
  var title =
    data.title ||
    n.title ||
    (isTest
      ? "✓ Push thử"
      : isChat
        ? "💬 Tin nhắn mới"
        : isArr
          ? "📍 Xác nhận đến vị trí"
          : isRem
            ? "🔔 Nhắc hẹn"
            : "📋 Công việc mới");
  var body = data.body || n.body || "";
  var tag = isTest
    ? "test_push"
    : isChat
      ? "chat_" + (data.msgId || data.threadId || "msg")
      : isArr
        ? "arr_" + (data.reminderId || data.asgnId || "arrival")
        : isRem
          ? "rem_" + (data.reminderId || "reminder")
          : "asgn_" + (data.asgnId || "new");
  var vibrate = isRem || isArr
    ? [0, 250, 120, 250, 120, 350, 120, 350]
    : [0, 280, 140, 280, 140, 280, 140, 400];
  var link = deepLinkFromData(data);
  var notiData = Object.assign({}, data, { link: link });

  return self.registration.showNotification(title, {
    body: body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: notiData,
    tag: tag,
    vibrate: vibrate,
    sound: isRem || isArr ? "/remind.wav" : "/noti.wav",
    silent: false,
    renotify: true,
    requireInteraction: true,
  });
}

messaging.onBackgroundMessage(function (payload) {
  var data = (payload && payload.data) || {};
  return Promise.all([
    ackDelivered(data),
    showPushNotification(payload),
  ]);
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var data = (event.notification && event.notification.data) || {};
  var url = data.link || deepLinkFromData(data);
  event.waitUntil(
    Promise.all([
      ackDelivered(data),
      clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if ("focus" in c) {
            if ("navigate" in c) {
              try {
                return c.navigate(url).then(function () {
                  return c.focus();
                });
              } catch (e) {
                return c.focus();
              }
            }
            return c.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      }),
    ])
  );
});
