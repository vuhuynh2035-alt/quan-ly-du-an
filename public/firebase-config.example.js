// Sao chép file này thành firebase-config.js và điền thông tin từ Firebase Console.
// Project Settings → Your apps → Web app → firebaseConfig
// Cloud Messaging → Web Push certificates → Key pair (VAPID)

var FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Bắt buộc cho thông báo trên trình duyệt / điện thoại
var FIREBASE_VAPID_KEY = "YOUR_VAPID_KEY";

// Mã đội mặc định (cùng team dùng chung mã này khi đăng ký)
var FIREBASE_DEFAULT_ORG = "saree";
