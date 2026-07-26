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

function showPushNotification(payload) {
  var data = (payload && payload.data) || {};
  var n = (payload && payload.notification) || {};
  var isRem = data.type === "reminder";
  var isArr = data.type === "arrival";
  var isChat = data.type === "chat";
  var title =
    data.title ||
    n.title ||
    (isArr
      ? "📍 Xác nhận đến vị trí"
      : isRem
        ? "🔔 Nhắc hẹn"
        : isChat
          ? "💬 Tin nhắn mới"
          : "📋 Công việc mới");
  var body = data.body || n.body || "";
  var tag = isChat
    ? "chat_" + (data.msgId || "new")
    : isArr
      ? "arr_" + (data.reminderId || data.asgnId || "arrival")
      : isRem
        ? "rem_" + (data.reminderId || "reminder")
        : "asgn_" + (data.asgnId || "new");
  var vibrate = isRem || isArr
    ? [0, 250, 120, 250, 120, 350, 120, 350]
    : [0, 280, 140, 280, 140, 280, 140, 400];

  return self.registration
    .showNotification(title, {
      body: body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: data,
      tag: tag,
      vibrate: vibrate,
      sound: isRem || isArr ? "/remind.wav" : "/noti.wav",
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
  return showPushNotification(payload);
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var data = (event.notification && event.notification.data) || {};
  var url = "/";
  if (data.type === "reminder") url = "/?tab=lich";
  else if (data.type === "arrival" || data.type === "assignment") url = "/?tab=mywork";
  else if (data.type === "chat") url = "/?tab=chat";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if ("focus" in c) {
          if ("navigate" in c && url !== "/") {
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
    })
  );
});
