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

messaging.onBackgroundMessage(function (payload) {
  var n = (payload && payload.notification) || {};
  var title = n.title || "Công việc mới";
  var options = {
    body: n.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: (payload && payload.data) || {},
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
